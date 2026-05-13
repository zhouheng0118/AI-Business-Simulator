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

_DEFAULT_UNLOCK = "Student asks a specific follow-up about this risk, constraint, or metric."


async def generate_playbook(
    raw_content: str,
    case_type: str,
    teaching_goals: list[str],
    title: str = "",
) -> dict:
    """Generate a complete simulation playbook from case content."""
    goals_text = ", ".join(teaching_goals) if teaching_goals else "strategic decision-making"
    content_excerpt = raw_content[:6000].strip()

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
                "locked_info": [
                    "<specific deeper fact or implication that should only emerge after a good follow-up>",
                    "<another deeper risk, tradeoff, or constraint>"
                ],
                "unlock_conditions": "<one sentence describing what the student must ask for this role to reveal locked_info>",
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

Generate a complete simulation playbook with exactly 5 stakeholder roles, global info atoms, and 2-3 discussion questions.

Each role's focus:
{role_guidance}

Return ONLY valid JSON, no markdown:
{{
  "roles": {roles_schema},
  "info_atoms": [
    {{
      "fact": "<specific factual atom from this case>",
      "owner_roles": ["<one role name from the roles list>"],
      "access": "allowed",
      "unlock_condition": ""
    }},
    {{
      "fact": "<specific hidden/deeper factual atom from this case>",
      "owner_roles": ["<one role name from the roles list>"],
      "access": "locked",
      "unlock_condition": "<what the student must ask to unlock this fact>"
    }}
  ],
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
- This is a business-school simulation, not a generic summary
- Use exactly these 5 role names and role_type values from the schema
- Each role's allowed_info must contain 4-5 specific, concrete facts extracted from the case content
- Each role's locked_info must contain 1-3 deeper facts, risks, tradeoffs, or implications from the case
- Each role must have a concrete unlock_conditions sentence
- info_atoms must include both allowed and locked facts and must use owner_roles that match the role names or role_type values
- Facts must be grounded in THIS case (names, numbers, constraints mentioned in the content)
- The CEO and CFO may share some overlapping strategic/financial facts
- Generate 2-3 final questions when possible: one decision question, one analysis question, and optionally one reflection question
- Questions must be specific to this case's central dilemma — not generic"""

    raw = await complete(prompt, max_tokens=4000)
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
    info_atoms = _validate_info_atoms(data.get("info_atoms") or [], roles)
    questions = _validate_questions(data.get("questions") or [])

    return {"roles": roles, "info_atoms": info_atoms, "questions": questions}


def _validate_roles(raw_roles: list) -> list:
    result = []

    for name, title_, rt in _FIXED_ROLES:
        matched = next(
            (
                r
                for r in raw_roles
                if isinstance(r, dict)
                and (
                    r.get("name", "").strip() == name
                    or r.get("role_type", "").strip() == rt
                )
            ),
            None,
        )
        if matched:
            allowed_info = _string_list(matched.get("allowed_info"))[:6]
            locked_info = _string_list(matched.get("locked_info"))[:4]
            result.append(
                {
                    "name": name,
                    "title": str(matched.get("title") or title_),
                    "role_type": rt,
                    "persona": str(matched.get("persona") or ""),
                    "focus_area": str(matched.get("focus_area") or _ROLE_GUIDANCE[name]),
                    "allowed_info": allowed_info,
                    "locked_info": locked_info,
                    "unlock_conditions": str(
                        matched.get("unlock_conditions")
                        or matched.get("unlock_condition")
                        or _DEFAULT_UNLOCK
                    ),
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
                    "locked_info": [],
                    "unlock_conditions": _DEFAULT_UNLOCK,
                }
            )

    return result


def _validate_info_atoms(raw_atoms: list, roles: list) -> list:
    """Return normalized info atoms, supplementing from role facts when needed."""
    role_by_name = {role["name"]: role for role in roles}
    role_types = {role["role_type"] for role in roles}
    atoms = []
    seen = set()

    for atom in raw_atoms:
        if not isinstance(atom, dict):
            continue

        fact = str(atom.get("fact") or "").strip()
        if not fact:
            continue

        access = str(atom.get("access") or "allowed").strip().lower()
        if access not in ("allowed", "locked"):
            access = "allowed"

        owners = [
            str(owner).strip()
            for owner in (atom.get("owner_roles") or [])
            if str(owner).strip()
        ]
        owners = [
            owner for owner in owners
            if owner in role_by_name or owner in role_types
        ]
        if not owners:
            continue

        unlock_condition = str(atom.get("unlock_condition") or "").strip()
        if access == "locked" and not unlock_condition:
            unlock_condition = _DEFAULT_UNLOCK

        key = (fact.lower(), access, tuple(sorted(owners)))
        if key in seen:
            continue
        seen.add(key)
        atoms.append(
            {
                "fact": fact,
                "owner_roles": owners,
                "access": access,
                "unlock_condition": unlock_condition,
            }
        )

    for role in roles:
        for fact in role.get("allowed_info") or []:
            key = (fact.lower(), "allowed", (role["name"],))
            if key in seen:
                continue
            seen.add(key)
            atoms.append(
                {
                    "fact": fact,
                    "owner_roles": [role["name"], role["role_type"]],
                    "access": "allowed",
                    "unlock_condition": "",
                }
            )

        for fact in role.get("locked_info") or []:
            unlock_condition = role.get("unlock_conditions") or _DEFAULT_UNLOCK
            key = (fact.lower(), "locked", (role["name"],))
            if key in seen:
                continue
            seen.add(key)
            atoms.append(
                {
                    "fact": fact,
                    "owner_roles": [role["name"], role["role_type"]],
                    "access": "locked",
                    "unlock_condition": unlock_condition,
                }
            )

    return atoms


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
    roles = [
        {
            "name": name,
            "title": title_,
            "role_type": rt,
            "persona": "",
            "focus_area": _ROLE_GUIDANCE[name],
            "allowed_info": [],
            "locked_info": [],
            "unlock_conditions": _DEFAULT_UNLOCK,
        }
        for name, title_, rt in _FIXED_ROLES
    ]
    return {
        "roles": roles,
        "info_atoms": _validate_info_atoms([], roles),
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


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]
