"""Live integration test: 与每个 Agent 对话，打印真实模型输出。

运行方式（在 backend/ 目录下）:
    python -m pytest tests/test_live_agents.py -v -s

或直接运行:
    python tests/test_live_agents.py
"""

from __future__ import annotations

import asyncio
import sys
import os

# 让测试可以直接从 backend/ 目录外运行
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 加载 .env（确保 API key 生效）
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

from agents.orchestrator import handle_student_message

# ── Spotify India 案例 Playbook（与 seeds.sql 保持一致）──────────────────────

SPOTIFY_PLAYBOOK = {
    "roles": [
        {
            "role_type": "strategy",
            "name": "CEO",
            "title": "Chief Executive Officer",
            "persona": "Visionary, growth-focused, optimistic about India's long-term potential",
            "focus_area": "Strategic vision & growth pressure",
            "allowed_info": [
                "Spotify entered India in 2019 with a freemium model",
                "8M monthly active users, 3% conversion to paid",
                "Long-term goal: profitability within 3 years",
                "Telecom partnership talks are ongoing",
            ],
            "locked_info": [
                "Internal debate about exiting the India market if losses exceed $50M",
                "Board pressure to show profitability by Q4 next year",
            ],
            "unlock_conditions": "Student must ask about strategic options including exit, AND must have already interviewed CFO",
        },
        {
            "role_type": "finance",
            "name": "CFO",
            "title": "Chief Financial Officer",
            "persona": "Cautious, data-driven, focused on unit economics",
            "focus_area": "Unit economics and financial sustainability",
            "allowed_info": [
                "ARPU in India is $0.60 vs $5.20 globally",
                "Licensing costs consume 78% of India revenue",
                "Telecom partnership requires 40% revenue sharing",
                "India operation is not yet profitable",
            ],
            "locked_info": [
                "Current India operation loses $18M annually",
                "Break-even requires 12% paid conversion rate",
            ],
            "unlock_conditions": "Student asks specifically about loss figures or break-even analysis",
        },
        {
            "role_type": "operations",
            "name": "Operations Director",
            "title": "Head of Operations",
            "persona": "Pragmatic, detail-oriented, execution-focused",
            "focus_area": "Content licensing and operational execution",
            "allowed_info": [
                "Artist royalty disputes have delayed 12% of Bollywood catalog",
                "Mobile data costs dropped 95% since 2016, audio consumption up 300%",
                "Local content licensing requires separate negotiations with 3 major labels",
                "Customer support operates in 12 Indian languages",
            ],
            "locked_info": [
                "Two key Bollywood label contracts expire in 6 months with no renewal agreed",
                "Content delivery infrastructure costs 2x more in Tier-2 cities",
            ],
            "unlock_conditions": "Student asks about content licensing risks or infrastructure challenges",
        },
        {
            "role_type": "customer_market",
            "name": "Customer Representative",
            "title": "Target Market Customer",
            "persona": "Price-sensitive urban millennial who uses multiple streaming apps",
            "focus_area": "User behavior and willingness to pay",
            "allowed_info": [
                "JioSaavn and Gaana together hold 65% market share",
                "Reliance Jio offers bundled music streaming to 450M subscribers for free",
                "Most users use the free ad-supported tier",
                "Spotify's premium features (offline, quality) are valued but not at global pricing",
            ],
            "locked_info": [
                "70% of surveyed users would pay up to ₹49/month (≈$0.60) but not ₹119/month",
                "Brand perception as 'international and premium' is both an asset and a barrier",
            ],
            "unlock_conditions": "Student asks about price sensitivity or what it would take to convert free users",
        },
        {
            "role_type": "local_regulatory",
            "name": "Local Expert",
            "title": "Market Consultant",
            "persona": "Well-connected, pragmatic, understands both regulatory and cultural landscape",
            "focus_area": "Regulatory environment and local market dynamics",
            "allowed_info": [
                "India requires local content quotas for streaming platforms in some categories",
                "Foreign investment restrictions cap streaming platform ownership at 49% in some structures",
                "GST on digital services is 18%, applied to subscription revenue",
                "Data localization regulations require storing Indian user data on Indian servers",
            ],
            "locked_info": [
                "A new regulatory proposal could mandate 30% Indian music quotas on playlists",
                "Jio's lobbying has influenced recent telecom-adjacent streaming regulations",
            ],
            "unlock_conditions": "Student asks about upcoming regulatory changes or political economy of streaming",
        },
    ],
    "info_atoms": [],
    "checklist_items": [
        {
            "objective_index": 0,
            "task": "Break-even conversion rate",
            "completion_condition": "Student correctly calculates or discusses the break-even paid conversion rate",
            "suggested_roles": ["CFO"],
        },
        {
            "objective_index": 0,
            "task": "India revenue loss magnitude",
            "completion_condition": "Student asks about how much India operation is losing annually",
            "suggested_roles": ["CFO"],
        },
        {
            "objective_index": 0,
            "task": "Competitive market structure",
            "completion_condition": "Student identifies JioSaavn/Gaana share and Jio bundle impact",
            "suggested_roles": ["Customer Representative", "Local Expert"],
        },
    ],
    "calculation_challenges": [
        {
            "metric": "break-even paid conversion rate",
            "formula_hint": "Total operating costs ÷ (ARPU × total MAU)",
            "required_data": ["India ARPU", "licensing cost percentage"],
            "owner_roles": ["CFO"],
            "objective_index": 0,
            "expected_insight": "India needs ~12% paid conversion to break even, vs current 3%",
        }
    ],
    "questions": [
        {
            "id": "q1",
            "type": "decision",
            "text": "Should Spotify stay in India, double down, or exit? Justify with evidence.",
            "rubric_dimensions": [
                {"name": "Evidence Use", "weight": 25},
                {"name": "Analytical Depth", "weight": 25},
                {"name": "Recommendation Quality", "weight": 25},
                {"name": "Risk Awareness", "weight": 25},
            ],
        }
    ],
}

# ── 每个 Agent 对应的测试问题 ────────────────────────────────────────────────

CONVERSATIONS = [
    {
        "role": "CEO",
        "question": "What's the strategic vision for India, and what are the main options you're considering?",
    },
    {
        "role": "CFO",
        "question": "Can you walk me through the unit economics? How does India compare to other markets financially?",
    },
    {
        "role": "Operations Director",
        "question": "What are the biggest operational challenges in delivering the product in India?",
    },
    {
        "role": "Customer Representative",
        "question": "Why do most users stay on the free tier? What would it take for you to pay for a subscription?",
    },
    {
        "role": "Local Expert",
        "question": "What regulatory or legal factors should Spotify be aware of when operating in India?",
    },
]


async def run_conversation(role: str, question: str, session: dict) -> None:
    """与单个 Agent 对话并打印结果。"""
    print("\n" + "=" * 70)
    print(f"  ROLE: {role}")
    print(f"  Q: {question}")
    print("=" * 70)

    result = await handle_student_message(
        target_role=role,
        user_message=question,
        history=[],
        case_context={
            "playbook": SPOTIFY_PLAYBOOK,
            "session": session,
            "raw_content": (
                "Spotify India: 8M MAU, 3% paid, ARPU $0.60 vs $5.20 global. "
                "Licensing costs 78% of revenue. JioSaavn + Gaana = 65% market share. "
                "Jio bundles streaming free to 450M users. Telecom partnership needs 40% rev share."
            ),
        },
        extract_evidence=True,
    )

    print(f"\n[REPLY]\n{result['reply']}")
    print(f"\n[AGENT NAME]  {result['agent_name']}")
    print(f"[ROLE TYPE]   {result.get('role_type', 'n/a')}")
    print(f"[ROLE FOUND]  {result['role_found']}")
    print(f"[NEWLY UNLOCKED] {result.get('newly_unlocked', False)}")

    gc = result.get("guide_context")
    if gc:
        print(f"\n[GUIDE MODE]  {gc['mode']}")
        print(f"[GUIDE TARGET] {gc.get('target_description', '')}")
        print(f"[GUIDE RATIONALE] {gc.get('priority_rationale', '')}")

    evidence = result.get("evidence", [])
    if evidence:
        print(f"\n[EVIDENCE EXTRACTED — {len(evidence)} item(s)]")
        for i, ev in enumerate(evidence, 1):
            print(f"  {i}. {ev['key_info']}")
            if ev.get("data"):
                print(f"     data: {ev['data']}")
            if ev.get("risk"):
                print(f"     risk: {ev['risk']}")
    else:
        print("\n[EVIDENCE] (none extracted)")


async def main() -> None:
    print("\n" + "=" * 70)
    print("  CaseIQ — Live Agent Conversation Test")
    print("  Case: Spotify India Market Entry")
    print("=" * 70)

    # 共享 session 状态，跟踪已访问角色（用于解锁条件评估）
    session = {"interviewed_roles": []}

    for conv in CONVERSATIONS:
        await run_conversation(conv["role"], conv["question"], session)
        session["interviewed_roles"].append(conv["role"])

    print("\n" + "=" * 70)
    print("  所有 Agent 对话完成")
    print("=" * 70)


# ── unittest 包装（支持 pytest -v -s 运行）─────────────────────────────────

import unittest


class LiveAgentTests(unittest.IsolatedAsyncioTestCase):
    """用真实模型逐一测试每个 Agent 的回复质量。"""

    async def _test_role(self, role: str, question: str, session: dict) -> dict:
        result = await handle_student_message(
            target_role=role,
            user_message=question,
            history=[],
            case_context={
                "playbook": SPOTIFY_PLAYBOOK,
                "session": session,
                "raw_content": (
                    "Spotify India: 8M MAU, 3% paid, ARPU $0.60 vs $5.20 global. "
                    "Licensing costs 78% of revenue. JioSaavn + Gaana = 65% market share."
                ),
            },
            extract_evidence=True,
        )
        print(f"\n{'─'*60}")
        print(f"ROLE: {role}")
        print(f"Q:    {question}")
        print(f"A:    {result['reply']}")
        for ev in result.get("evidence", []):
            print(f"  ▸ [{ev['source']}] {ev['key_info']}")
            if ev.get('data'):
                print(f"        data: {ev['data']}")
        return result

    async def test_ceo(self):
        session = {"interviewed_roles": [], "follow_up_history": {}, "checklist_completed": [], "evidence_board": []}
        r = await self._test_role(
            "CEO",
            "What's the strategic vision for India, and what are the main options you're considering?",
            session,
        )
        self.assertTrue(r["role_found"])
        self.assertNotEqual(r["reply"], "")
        self.assertEqual(r["agent_name"], "CEO")
        # Reply should end with a follow-up question
        reply_stripped = r["reply"].strip()
        self.assertTrue(reply_stripped.endswith("?"), f"Expected reply to end with '?', got: ...{reply_stripped[-80:]!r}")
        # guide_context must be present
        gc = r.get("guide_context")
        self.assertIsNotNone(gc)
        self.assertIn(gc["mode"], ("validation", "unlock_probe", "calculation_challenge", "checklist_probe", "cross_role_referral", "deepen"))

    async def test_cfo(self):
        session = {"interviewed_roles": ["CEO"], "follow_up_history": {}, "checklist_completed": [], "evidence_board": []}
        r = await self._test_role(
            "CFO",
            "Can you walk me through the unit economics? How does India compare to other markets financially?",
            session,
        )
        self.assertTrue(r["role_found"])
        self.assertEqual(r["role_type"], "finance")
        gc = r.get("guide_context")
        self.assertIsNotNone(gc)
        # CFO has checklist items — should be checklist_probe or better
        self.assertIn(gc["mode"], ("unlock_probe", "calculation_challenge", "checklist_probe", "cross_role_referral", "deepen"))

    async def test_cfo_validation_after_challenge(self):
        """After a calculation_challenge follow-up, a numeric reply should trigger validation mode."""
        session = {
            "interviewed_roles": ["CEO"],
            "follow_up_history": {
                "CFO": [{"mode": "calculation_challenge", "target": "break-even paid conversion rate"}]
            },
            "checklist_completed": [],
            "evidence_board": [],
        }
        r = await self._test_role(
            "CFO",
            "I calculated about 12% conversion rate is needed to break even.",
            session,
        )
        self.assertTrue(r["role_found"])
        gc = r.get("guide_context")
        self.assertIsNotNone(gc)
        self.assertEqual(gc["mode"], "validation", f"Expected validation mode, got {gc['mode']}")

    async def test_operations_director(self):
        session = {"interviewed_roles": ["CEO", "CFO"], "follow_up_history": {}, "checklist_completed": [], "evidence_board": []}
        r = await self._test_role(
            "Operations Director",
            "What are the biggest operational challenges in delivering the product in India?",
            session,
        )
        self.assertTrue(r["role_found"])
        self.assertEqual(r["role_type"], "operations")
        gc = r.get("guide_context")
        self.assertIsNotNone(gc)

    async def test_customer_representative(self):
        session = {"interviewed_roles": ["CEO", "CFO", "Operations Director"], "follow_up_history": {}, "checklist_completed": [], "evidence_board": []}
        r = await self._test_role(
            "Customer Representative",
            "Why do most users stay on the free tier? What would it take for you to pay for a subscription?",
            session,
        )
        self.assertTrue(r["role_found"])
        self.assertEqual(r["role_type"], "customer_market")
        gc = r.get("guide_context")
        self.assertIsNotNone(gc)

    async def test_local_expert(self):
        session = {"interviewed_roles": ["CEO", "CFO", "Operations Director", "Customer Representative"], "follow_up_history": {}, "checklist_completed": [], "evidence_board": []}
        r = await self._test_role(
            "Local Expert",
            "What regulatory or legal factors should Spotify be aware of when operating in India?",
            session,
        )
        self.assertTrue(r["role_found"])
        self.assertEqual(r["role_type"], "local_regulatory")
        gc = r.get("guide_context")
        self.assertIsNotNone(gc)


if __name__ == "__main__":
    asyncio.run(main())
