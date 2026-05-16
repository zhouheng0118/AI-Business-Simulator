"""Generate a structured simulation playbook from raw case content."""

from __future__ import annotations

import asyncio
import json
import re
from llm_client import complete
from text_utils import STOPWORDS as _ATOM_STOPWORDS, word_overlap_ratio
from agents.prompts import background as _p_background
from agents.prompts import checklist as _p_checklist
from agents.prompts import info_atoms as _p_info_atoms
from agents.prompts import opening_fields as _p_opening_fields
from agents.prompts import playbook as _p_playbook

_BASIC_CATEGORIES = {
    "company_background",
    "decision_context",
    "role_statement",
    "visible_tension",
    "public_numbers",
}

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

_OPENING_ROLE_GUIDANCE = {
    "CEO":                     "One sentence: your strategic role in this specific case's decision context.",
    "CFO":                     "One sentence: your financial oversight role and the key financial dimension at stake in this case.",
    "Operations Director":     "One sentence: your operational responsibility and the core execution challenge in this case.",
    "Customer Representative": "One sentence: who you are as a customer and why your perspective matters for this decision.",
    "Local Expert":            "One sentence: your local expertise and the most critical local factor relevant to this case.",
}

_OPENING_TOPICS_GUIDANCE = {
    "CEO":                     "4-6 strategic topics specific to THIS case: e.g. market entry timing, competitive positioning, strategic trade-offs, growth targets, board priorities",
    "CFO":                     "4-6 financial topics specific to THIS case: e.g. unit economics, cash runway, funding requirements, break-even, cost structure, margins",
    "Operations Director":     "4-6 operational topics specific to THIS case: e.g. capacity constraints, staffing costs, logistics, execution timeline, supply chain",
    "Customer Representative": "4-6 demand/market topics specific to THIS case: e.g. price sensitivity, feature priorities, switching costs, adoption barriers, willingness to pay",
    "Local Expert":            "4-6 local/regulatory topics specific to THIS case: e.g. licensing requirements, rental costs, compliance constraints, market entry barriers",
}

_OPENING_QUESTION_GUIDANCE = {
    "CEO":                     "One specific strategic question that cuts to the core decision or tension in this case.",
    "CFO":                     "One specific financial question about the central financial trade-off or risk in this case.",
    "Operations Director":     "One specific question about the key operational constraint or execution risk in this case.",
    "Customer Representative": "One specific question about customer preference, demand, or adoption in this case.",
    "Local Expert":            "One specific question about a critical local regulation, cost, or market constraint in this case.",
}



def _atom_terms(fact: str) -> set[str]:
    words = re.findall(r"[a-z][a-z0-9%-]{1,}", fact.lower())
    return {w for w in words if w not in _ATOM_STOPWORDS}


def _parse_json(raw: str):
    """Strip markdown fences and decode JSON; return parsed value or None on failure."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _deduplicate_atoms(atoms: list) -> list:
    """Remove near-duplicate facts across objectives, keeping the first occurrence.

    Allowed atoms: deduplicate by exact normalized text only.
    Locked atoms: deduplicate by word-overlap ≥ 55% (same threshold as evidence dedup).
    """
    allowed_seen: set[str] = set()
    locked_result: list = []
    result: list = []

    for atom in atoms:
        fact = atom.get("fact", "")
        normalized = re.sub(r"\s+", " ", fact.strip()).lower()

        if atom.get("access") == "allowed":
            if normalized in allowed_seen:
                continue
            allowed_seen.add(normalized)
            result.append(atom)
        else:
            terms = _atom_terms(fact)
            is_dup = False
            for existing in locked_result:
                existing_terms = _atom_terms(existing.get("fact", ""))
                if not terms or not existing_terms:
                    continue
                if word_overlap_ratio(terms, existing_terms) >= 0.55:
                    is_dup = True
                    break
            if not is_dup:
                locked_result.append(atom)
                result.append(atom)

    return result


async def _generate_all_info_atoms(
    raw_content: str,
    roles: list,
    title: str = "",
    teaching_goals: list[str] | None = None,
) -> list:
    """Generate info atoms for all teaching goals in a single LLM call.

    Each atom is tagged with objective_index indicating which goal it serves.
    Using one call avoids rate-limit issues when there are multiple goals.
    """
    goals = teaching_goals or []
    # Cap content to ~8000 chars to stay within per-minute token quota.
    # _generate_checklist_items already caps at 3000; use a larger window here
    # since atoms need more context to classify correctly.
    content_excerpt = raw_content.strip()[:8000]

    roles_context = "\n".join(
        f"- {r['name']}: " + ("; ".join((r.get("allowed_info") or [])[:3]) or "(none listed)")
        for r in roles
    )

    if goals:
        goals_block = "\n".join(f"  Goal {i} (objective_index={i}): {g}" for i, g in enumerate(goals))
        goals_instruction = f"""Teaching Goals (generate atoms for EACH goal, tag each atom with its objective_index):
{goals_block}

For each goal, extract facts that directly help a student achieve that specific goal.
Each atom must carry the objective_index of the goal it primarily serves."""
        per_goal_counts = f"- 3-5 allowed atoms PER goal (total {3*len(goals)}-{5*len(goals)})"
        per_locked_counts = f"- 5-8 locked atoms PER goal (total {5*len(goals)}-{8*len(goals)})"
    else:
        goals_block = "strategic decision-making"
        goals_instruction = f"Teaching Goal: {goals_block}\nAll atoms use objective_index=0."
        per_goal_counts = "- 4-6 allowed atoms"
        per_locked_counts = "- 5-8 locked atoms"

    max_tokens = 2000 + 1500 * max(0, len(goals) - 1)

    prompt = _p_info_atoms.build(
        title=title,
        goals_instruction=goals_instruction,
        content_excerpt=content_excerpt,
        roles_context=roles_context,
        per_goal_counts=per_goal_counts,
        per_locked_counts=per_locked_counts,
    )

    raw = await complete(prompt, max_tokens=max_tokens, temperature=0.2)
    atoms = _parse_info_atoms_multi(raw, num_objectives=max(1, len(goals)))
    return _deduplicate_atoms(atoms)


def _parse_info_atoms_multi(raw: str, num_objectives: int = 1) -> list:
    """Parse info atoms where objective_index comes from the LLM output itself.

    Falls back to 0 for any atom missing or with an out-of-range objective_index.
    """
    items = _parse_json(raw)
    if not isinstance(items, list):
        return []

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        fact = str(item.get("fact") or "").strip()
        if not fact or len(fact.split()) < 4:
            continue
        # Hard cap: truncate to 25 words to keep atoms concise
        fact_words = fact.split()
        if len(fact_words) > 25:
            fact = " ".join(fact_words[:25])
        access = item.get("access", "allowed")
        if access not in ("allowed", "locked"):
            access = "allowed"
        owner_roles = [str(r) for r in (item.get("owner_roles") or []) if r]
        unlock_condition = str(item.get("unlock_condition") or "").strip()
        uc_words = unlock_condition.split()
        if len(uc_words) > 25:
            unlock_condition = " ".join(uc_words[:25])

        raw_level = item.get("level")
        if access == "allowed":
            level = 0
        elif raw_level in (1, 2, 3):
            level = int(raw_level)
        else:
            level = 1

        raw_category = str(item.get("category") or "").strip()
        if access == "locked":
            category = ""
        elif raw_category in _BASIC_CATEGORIES:
            category = raw_category
        else:
            category = ""

        try:
            oi = int(item.get("objective_index", 0))
        except (TypeError, ValueError):
            oi = 0
        if oi < 0 or oi >= num_objectives:
            oi = 0

        result.append({
            "fact": fact,
            "owner_roles": owner_roles,
            "access": access,
            "unlock_condition": unlock_condition,
            "level": level,
            "category": category,
            "objective_index": oi,
        })

    return result



async def synthesize_background(info_atoms: list) -> str:
    """Synthesize a student-facing background paragraph from basic layer info atoms.

    Takes the allowed (basic layer) atoms, grouped by category, and asks the
    LLM to write a single cohesive narrative paragraph — not a bullet list.
    Returns an empty string if there are no allowed atoms.
    """
    allowed = [a for a in info_atoms if a.get("access") == "allowed"]
    if not allowed:
        return ""

    category_order = [
        "company_background",
        "decision_context",
        "role_statement",
        "visible_tension",
        "public_numbers",
    ]
    by_cat: dict[str, list[str]] = {c: [] for c in category_order}
    uncategorized: list[str] = []
    for atom in allowed:
        cat = atom.get("category", "")
        if cat in by_cat:
            by_cat[cat].append(atom["fact"])
        else:
            uncategorized.append(atom["fact"])

    sections: list[str] = []
    labels = {
        "company_background": "Company & Market",
        "decision_context":   "Decision Context",
        "role_statement":     "Stakeholder Roles",
        "visible_tension":    "Known Tensions",
        "public_numbers":     "Key Numbers",
    }
    for cat in category_order:
        facts = by_cat[cat]
        if facts:
            bullet_list = "\n".join(f"- {f}" for f in facts)
            sections.append(f"[{labels[cat]}]\n{bullet_list}")
    if uncategorized:
        bullet_list = "\n".join(f"- {f}" for f in uncategorized)
        sections.append(f"[Other]\n{bullet_list}")

    facts_text = "\n\n".join(sections)

    prompt = _p_background.build(facts_text=facts_text)

    result = await complete(prompt, max_tokens=400, temperature=0.3)
    return result.strip()


async def _generate_checklist_items(
    teaching_goals: list[str],
    raw_content: str,
    title: str = "",
) -> list:
    """Generate 3-5 investigation checklist items per teaching goal.

    Returns a list of checklist items:
      [{objective_index, task, completion_condition}]
    """
    if not teaching_goals:
        return []

    goals_text = "\n".join(f"{i+1}. {g}" for i, g in enumerate(teaching_goals))
    content_excerpt = raw_content.strip()[:3000]

    prompt = _p_checklist.build(
        title=title,
        goals_text=goals_text,
        content_excerpt=content_excerpt,
    )

    raw = await complete(prompt, max_tokens=1500, temperature=0.2)
    return _parse_checklist_items(raw, len(teaching_goals))


def _parse_checklist_items(raw: str, num_objectives: int) -> list:
    """Parse and validate checklist items from LLM output."""
    items = _parse_json(raw)
    if not isinstance(items, list):
        return []

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        task = str(item.get("task") or "").strip()
        condition = str(item.get("completion_condition") or "").strip()
        if not task or not condition:
            continue
        raw_idx = item.get("objective_index")
        try:
            idx = int(raw_idx)
        except (TypeError, ValueError):
            idx = 0
        if idx < 0 or idx >= num_objectives:
            idx = 0
        result.append({
            "objective_index": idx,
            "task": task,
            "completion_condition": condition,
        })

    return result


async def _generate_opening_fields(raw_content: str, title: str = "") -> list[dict]:
    """Generate opening card fields for all fixed roles in one focused call.

    Separated from the main playbook prompt so token limits on the main call
    don't silently drop these fields.
    """
    content_excerpt = raw_content.strip()[:4000]
    roles_list = "\n".join(f"- {name}" for name, _, _ in _FIXED_ROLES)
    guidance = "\n".join(
        f"  {name}:\n"
        f"    opening_role_description: {_OPENING_ROLE_GUIDANCE[name]}\n"
        f"    opening_topics: {_OPENING_TOPICS_GUIDANCE[name]}\n"
        f"    opening_suggested_question: {_OPENING_QUESTION_GUIDANCE[name]}"
        for name, _, _ in _FIXED_ROLES
    )

    prompt = _p_opening_fields.build(
        title=title,
        content_excerpt=content_excerpt,
        roles_list=roles_list,
        guidance=guidance,
    )

    raw = await complete(prompt, max_tokens=1500, temperature=0.2)
    return _parse_opening_fields(raw)


def _parse_opening_fields(raw: str) -> list[dict]:
    items = _parse_json(raw)
    if not isinstance(items, list):
        return []

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        result.append({
            "name": name,
            "opening_role_description": str(item.get("opening_role_description") or "").strip(),
            "opening_topics": [str(t) for t in (item.get("opening_topics") or []) if t][:8],
            "opening_suggested_question": str(item.get("opening_suggested_question") or "").strip(),
        })

    return result


async def generate_playbook(
    raw_content: str,
    case_type: str,
    teaching_goals: list[str],
    title: str = "",
) -> dict:
    """Generate roles, background summary, questions, info atoms, and checklist from case content.

    Returns {background_summary, roles, questions, info_atoms, checklist_items}.
    """
    goals_text = ", ".join(teaching_goals) if teaching_goals else "strategic decision-making"
    content_excerpt = raw_content.strip()

    role_guidance = "\n".join(
        f"- {name}: {guidance}" for name, guidance in _ROLE_GUIDANCE.items()
    )
    opening_guidance = "\n".join(
        f"- {name}:\n"
        f"    opening_role_description: {_OPENING_ROLE_GUIDANCE[name]}\n"
        f"    opening_topics: {_OPENING_TOPICS_GUIDANCE[name]}\n"
        f"    opening_suggested_question: {_OPENING_QUESTION_GUIDANCE[name]}"
        for name in _OPENING_ROLE_GUIDANCE
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
                "opening_role_description": "<one sentence: this stakeholder's specific role in the context of this case>",
                "opening_topics": ["<case-specific topic 1>", "<case-specific topic 2>", "<case-specific topic 3>", "<case-specific topic 4>"],
                "opening_suggested_question": "<one specific question a student could start with to learn something important from this stakeholder>",
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

    prompt = _p_playbook.build(
        title=title,
        case_type=case_type,
        goals_text=goals_text,
        content_excerpt=content_excerpt,
        role_guidance=role_guidance,
        opening_guidance=opening_guidance,
        roles_schema=roles_schema,
    )

    raw = await complete(prompt, max_tokens=3500)
    playbook = _parse_playbook(raw)

    # All secondary passes run in parallel to reduce total generation time.
    # opening_fields is a dedicated call so token limits on the main prompt
    # never silently drop the opening card data.
    opening_fields, info_atoms, checklist_items = await asyncio.gather(
        _generate_opening_fields(raw_content, title),
        _generate_all_info_atoms(
            raw_content,
            playbook["roles"],
            title=title,
            teaching_goals=teaching_goals,
        ),
        _generate_checklist_items(teaching_goals, raw_content, title),
    )

    # Merge opening fields into roles; prefer dedicated-call results but keep
    # main-prompt values as a fallback if the dedicated call fails for a role.
    opening_by_name = {f["name"]: f for f in opening_fields}
    for role in playbook["roles"]:
        fields = opening_by_name.get(role["name"], {})
        if fields.get("opening_role_description"):
            role["opening_role_description"] = fields["opening_role_description"]
        if fields.get("opening_topics"):
            role["opening_topics"] = fields["opening_topics"]
        if fields.get("opening_suggested_question"):
            role["opening_suggested_question"] = fields["opening_suggested_question"]

    playbook["info_atoms"] = info_atoms
    playbook["checklist_items"] = checklist_items

    return playbook


def _parse_playbook(raw: str) -> dict:
    data = _parse_json(raw)
    if not isinstance(data, dict):
        return _fallback_playbook()

    background_summary = str(data.get("background_summary") or "").strip()
    roles = _validate_roles(data.get("roles") or [])
    info_atoms = _validate_info_atoms(data.get("info_atoms") or [], roles)
    questions = _validate_questions(data.get("questions") or [])

    return {"background_summary": background_summary, "roles": roles, "questions": questions}


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
                    "opening_statement": str(matched.get("opening_statement") or ""),
                    "opening_role_description": str(matched.get("opening_role_description") or ""),
                    "opening_topics": [str(t) for t in (matched.get("opening_topics") or []) if t][:8],
                    "opening_suggested_question": str(matched.get("opening_suggested_question") or ""),
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
                    "opening_statement": "",
                    "opening_role_description": "",
                    "opening_topics": [],
                    "opening_suggested_question": "",
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
        "background_summary": "",
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
