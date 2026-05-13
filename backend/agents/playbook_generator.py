"""Generate a structured simulation playbook from raw case content."""

import json
import re
from llm_client import complete

_FIXED_ROLES = [
    ("CEO",                     "Chief Executive Officer", "strategy"),
    ("CFO",                     "Chief Financial Officer", "finance"),
    ("Operations Director",     "Head of Operations",      "operations"),
    ("Customer Representative", "Target Market Customer",  "customer_market"),
    ("Local Expert",            "Market Consultant",        "local_regulatory"),
]

_ROLE_GUIDANCE = {
    "CEO":                     "Strategic vision, growth pressure, competitive positioning",
    "CFO":                     "Financial metrics, cash flow, funding runway, ROI",
    "Operations Director":     "Supply chain, logistics, execution risk, staffing",
    "Customer Representative": "User preferences, price sensitivity, adoption barriers",
    "Local Expert":            "Local regulations, licensing, rental costs, market nuances",
}


async def generate_playbook(
    raw_content: str,
    case_type: str,
    teaching_goals: list[str],
    title: str = "",
) -> dict:
    """Generate roles and questions from case content. Returns {roles, questions}."""
    goals_text = ", ".join(teaching_goals) if teaching_goals else "strategic decision-making"
    content_excerpt = raw_content[:3500].strip()

    role_guidance = "\n".join(
        f"- {name}: {guidance}" for name, guidance in _ROLE_GUIDANCE.items()
    )

    roles_schema = json.dumps(
        [
            {
                "name": name,
                "title": title_,
                "role_type": rt,
                "persona": "<2-3 sentence character: personality, priorities, communication style>",
                "focus_area": "<one-phrase key concern in this specific case>",
                "allowed_info": [
                    "<specific concrete fact from the case content>",
                    "<another specific fact with numbers or details>",
                    "<third specific fact>",
                    "<fourth specific fact>",
                ],
            }
            for name, title_, rt in _FIXED_ROLES
        ],
        indent=2,
    )

    prompt = f"""You are generating a structured AI simulation playbook for a business school case study.

Case Title: {title}
Case Type: {case_type}
Teaching Goals: {goals_text}

Case Content:
{content_excerpt}

Generate exactly 5 stakeholder roles and 1 discussion question.

Each role's focus:
{role_guidance}

Return ONLY valid JSON, no markdown:
{{
  "roles": {roles_schema},
  "questions": [
    {{
      "id": "q1",
      "type": "{case_type}",
      "text": "<a specific, challenging question directly tied to this case's core decision or tension>",
      "rubric_dimensions": [
        {{"name": "Evidence Use", "weight": 25}},
        {{"name": "Analytical Depth", "weight": 25}},
        {{"name": "Recommendation Quality", "weight": 25}},
        {{"name": "Risk Awareness", "weight": 25}}
      ]
    }}
  ]
}}

Requirements:
- Each role's allowed_info must contain 4-5 specific, concrete facts extracted from the case content
- Facts must be grounded in THIS case (names, numbers, constraints mentioned in the content)
- The CEO and CFO may share some overlapping strategic/financial facts
- The question must be specific to this case's central dilemma — not generic"""

    raw = await complete(prompt, max_tokens=2500)
    return _parse_playbook(raw)


def _parse_playbook(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return _fallback_playbook()

    if not isinstance(data, dict):
        return _fallback_playbook()

    roles = _validate_roles(data.get("roles") or [])
    questions = _validate_questions(data.get("questions") or [])

    return {"roles": roles, "questions": questions}


def _validate_roles(raw_roles: list) -> list:
    fixed_names = [r[0] for r in _FIXED_ROLES]
    result = []

    for name, title_, rt in _FIXED_ROLES:
        matched = next(
            (r for r in raw_roles if isinstance(r, dict) and r.get("name", "").strip() == name),
            None,
        )
        if matched:
            result.append(
                {
                    "name": name,
                    "title": str(matched.get("title") or title_),
                    "role_type": rt,
                    "persona": str(matched.get("persona") or ""),
                    "focus_area": str(matched.get("focus_area") or _ROLE_GUIDANCE[name]),
                    "allowed_info": [
                        str(x) for x in (matched.get("allowed_info") or []) if x
                    ][:6],
                }
            )
        else:
            result.append(
                {
                    "name": name,
                    "title": title_,
                    "role_type": rt,
                    "persona": "",
                    "focus_area": _ROLE_GUIDANCE[name],
                    "allowed_info": [],
                }
            )

    return result


def _validate_questions(raw_questions: list) -> list:
    result = []
    for i, q in enumerate(raw_questions[:3]):
        if not isinstance(q, dict):
            continue
        q_type = q.get("type", "decision")
        if q_type not in ("decision", "analysis", "reflection"):
            q_type = "decision"

        dims = q.get("rubric_dimensions") or []
        if not dims:
            dims = [
                {"name": "Evidence Use", "weight": 25},
                {"name": "Analytical Depth", "weight": 25},
                {"name": "Recommendation Quality", "weight": 25},
                {"name": "Risk Awareness", "weight": 25},
            ]
        else:
            dims = [
                {"name": str(d.get("name", "")), "weight": int(d.get("weight", 25))}
                for d in dims
                if isinstance(d, dict)
            ][:4]

        text = str(q.get("text") or "").strip()
        if not text:
            continue

        result.append(
            {
                "id": str(q.get("id") or f"q{i + 1}"),
                "type": q_type,
                "text": text,
                "rubric_dimensions": dims,
            }
        )

    return result or _fallback_questions()


def _fallback_playbook() -> dict:
    return {
        "roles": [
            {
                "name": name,
                "title": title_,
                "role_type": rt,
                "persona": "",
                "focus_area": _ROLE_GUIDANCE[name],
                "allowed_info": [],
            }
            for name, title_, rt in _FIXED_ROLES
        ],
        "questions": _fallback_questions(),
    }


def _fallback_questions() -> list:
    return [
        {
            "id": "q1",
            "type": "decision",
            "text": "Based on your interviews, what is your recommendation? Justify it with specific evidence and address the key risks.",
            "rubric_dimensions": [
                {"name": "Evidence Use", "weight": 25},
                {"name": "Analytical Depth", "weight": 25},
                {"name": "Recommendation Quality", "weight": 25},
                {"name": "Risk Awareness", "weight": 25},
            ],
        }
    ]
