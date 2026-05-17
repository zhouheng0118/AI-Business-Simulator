"""Manual fact-check test for the EVALUATING prompt.

Runs three scenarios against the real LLM via `handle_ceo_message`'s helpers
to see whether fabricated numbers / empty evidence get caught.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.orchestrator import (
    _build_ceo_orchestrator_prompt,
    _parse_mission_verdict,
    _strip_mission_verdict,
)
from llm_client import chat


CASE_TEXT = (
    "Whirlpool Europe is evaluating Project Atlantic, a strategic initiative to optimize "
    "supply chain efficiency and product availability. Current availability is 79%, leading "
    "to lost sales as customers switch to competitors. Built-in appliance contractors require "
    "delivery within 10 days — a standard current systems cannot reliably meet. Project Atlantic "
    "aims to raise availability to 92% and cut inventory by 12 days of sales. Phased capex: "
    "$4.3M (1999), $8.6M (2000), $6.9M (2001), $4.1M (2002). Hurdle rate 9%, tax 40%."
)

ROLES = [
    {"name": "CEO", "title": "Chief Executive Officer", "focus_area": "Competitive positioning and market share"},
    {"name": "CFO", "title": "Chief Financial Officer", "focus_area": "ROI and financial viability of the ERP investment"},
    {"name": "Operations Director", "title": "Head of Operations", "focus_area": "Supply chain transparency and execution risk"},
    {"name": "Customer Representative", "title": "Target Market Customer", "focus_area": "Product availability and delivery reliability"},
    {"name": "Local Expert", "title": "Market Consultant", "focus_area": "Regional costs and market nuances"},
]

CEO_ROLE = ROLES[0]

# CEO's previous briefing for mission 1 (lives in conversation history)
CEO_BRIEFING = (
    "Good. Let's start with the operational side.\n\n"
    "Before we judge whether Project Atlantic is financially worthwhile, I need to know what "
    "we're actually fixing on the ground. The 79% availability number on paper means nothing "
    "until we understand who is hurt by it and how tight the delivery windows really are.\n\n"
    "Speak with the Operations Director. Focus on the current state of product availability, "
    "the contractor delivery requirements, and what Project Atlantic concretely changes.\n\n"
    "Bring back the current vs. target availability, the contractor delivery window, and the "
    "main execution risks that could prevent us from hitting the target."
)

# Realistic evidence the student "collected" from Operations Director
REAL_EVIDENCE = [
    {
        "source": "Operations Director",
        "key_info": "Current product availability sits at 79%, causing lost sales when customers switch to competitors.",
        "data": "79% availability",
        "risk": "Lost revenue from competitor switching",
    },
    {
        "source": "Operations Director",
        "key_info": "Built-in appliance contractors require delivery within 10 days, which current systems cannot reliably satisfy.",
        "data": "10-day delivery window",
        "risk": "Damaged contractor relationships",
    },
    {
        "source": "Operations Director",
        "key_info": "Project Atlantic targets 92% availability and a 12-day reduction in inventory days of sales.",
        "data": "92% target, -12 days inventory",
        "risk": "Execution risk if rollout slips",
    },
]


# --- Three student reports ---

REPORT_A_GROUNDED = (
    "Reporting back from the Operations Director. Current product availability is 79%, "
    "and we're losing sales when customers switch to competitors because of it. The biggest "
    "operational constraint is the contractor channel for built-in appliances — they demand "
    "delivery within 10 days and our current systems can't reliably hit that. Project Atlantic "
    "targets 92% availability and cuts 12 days of inventory, so the main execution risk is "
    "whether the rollout actually delivers the throughput it promises."
)

REPORT_B_FABRICATED = (
    "I spoke with the Operations Director. Current availability is around 65%, which is why "
    "we're bleeding share. The contractor channel needs 5-day delivery and we're missing that "
    "window 40% of the time. Project Atlantic should push availability to 95% and cut inventory "
    "by 20 days. The main risk is that the German distribution center is at full capacity."
)
# ↑ 65% (real: 79%), 5-day (real: 10), 40% miss rate (not collected), 95% (real: 92%),
#   20 days (real: 12), German DC (never mentioned). Five fabricated facts.

REPORT_C_NO_EVIDENCE = (
    "Based on my analysis, current availability is 79% and Project Atlantic targets 92%. "
    "The contractor delivery requirement is 10 days. Recommend proceeding with the investment."
)
# Same numbers as REPORT_A, but the student has not actually interviewed anyone yet —
# evidence_board is empty. Tests whether the prompt catches "fabricated by guessing from the case brief".


async def run_scenario(label: str, evidence: list, student_report: str):
    mission_state = {
        "current_mission": 0,
        "phase": "investigating",
        "active_agents": ["CEO", "Operations Director"],
        "missions_completed": [],
        "interviewed_roles_by_mission": [],
    }

    system_prompt = _build_ceo_orchestrator_prompt(
        mode="EVALUATING",
        current_idx=0,
        roles=ROLES,
        raw_content=CASE_TEXT,
        ceo_role=CEO_ROLE,
        mission_state=mission_state,
        evidence_board=evidence,
    )

    # Provide the CEO's prior briefing as conversation history so the
    # evaluator knows what it asked for.
    history = [
        {"role": "agent", "agent_name": "CEO", "content": CEO_BRIEFING},
    ]

    raw_reply = await chat(
        system_prompt,
        student_report,
        history=history,
        max_tokens=600,
        temperature=0.7,
    )

    verdict = _parse_mission_verdict(raw_reply)
    reply = _strip_mission_verdict(raw_reply)

    print("\n" + "=" * 70)
    print(f"SCENARIO: {label}")
    print("=" * 70)
    print(f"\nStudent report:\n{student_report}\n")
    print(f"Evidence count: {len(evidence)}")
    print(f"\nCEO reply:\n{reply}\n")
    print(f"VERDICT: {verdict}")


async def main():
    await run_scenario("A — Grounded (all numbers match evidence)", REAL_EVIDENCE, REPORT_A_GROUNDED)
    await run_scenario("B — Fabricated numbers (65%, 5-day, 95%, 20 days, German DC)", REAL_EVIDENCE, REPORT_B_FABRICATED)
    await run_scenario("C — No evidence collected but report cites numbers from case brief", [], REPORT_C_NO_EVIDENCE)


if __name__ == "__main__":
    asyncio.run(main())
