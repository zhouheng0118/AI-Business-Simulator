from __future__ import annotations

import asyncio
import json
import re
import time
from collections import defaultdict
import database as db

# Per-session write lock: prevents concurrent background tasks from
# overwriting each other's evidence/checklist DB updates.
_SESSION_WRITE_LOCKS: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
from agents.role_types import (
    canonical_role_type,
    infer_role_type,
    normalize_label,
    role_type_matches,
)
from agents.sub_agents import call_sub_agent, stream_sub_agent
from llm_client import FALLBACK_REPLY, chat, complete

_MIN_ROLES = 3
_MIN_EVIDENCE = 3
ROLE_ALIASES = {}


async def _llm(prompt: str, max_tokens: int = 10) -> str:
    """Run a deterministic utility LLM call."""
    return await complete(prompt, max_tokens=max_tokens, temperature=0.0)


def _normalize_text(value: object) -> str:
    """Normalize free text for equality checks."""
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


# Step 1: Intent / unlock evaluation 

async def _check_conditions_batch(
    conditions: list[str], session: dict, history: list, current_message: str
) -> list[bool]:
    """Evaluate multiple unlock/checklist conditions in a single LLM call."""
    if not conditions:
        return []
    recent = "\n".join(
        f"[{m['role'].upper()} / {m.get('agent_name', '')}]: {m['content']}"
        for m in history[-12:]
    )
    numbered = "\n".join(f"{i + 1}. {cond}" for i, cond in enumerate(conditions))
    prompt = f"""You are evaluating unlock conditions in a business case simulation.

Roles interviewed so far: {session.get("interviewed_roles", [])}
Student's current message: "{current_message}"

Recent conversation:
{recent}

For each condition below, answer true if it is met, false if not:
{numbered}

Reply with ONLY a JSON array of booleans in order. Example for 3 conditions: [true, false, true]"""

    raw = await _llm(prompt, max_tokens=60)
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list) and len(parsed) == len(conditions):
            return [bool(r) for r in parsed]
    except (json.JSONDecodeError, ValueError):
        pass
    # Fallback: assume none met
    return [False] * len(conditions)


async def _is_unlock_condition_met(
    condition: str, session: dict, history: list, current_message: str
) -> bool:
    """Return whether a locked information condition is satisfied."""
    results = await _check_conditions_batch([condition], session, history, current_message)
    return results[0] if results else False


# Step 2: Build allowed_info for this turn

def _level_gate_passed(atom: dict, session: dict) -> bool:
    """Whether the difficulty-level prerequisite for unlocking this atom is met.

    L1: no prerequisite (ask the right topic).
    L2: student must have interviewed at least one prior role.
    L3: student must have interviewed at least two prior roles (cross-reference).
    """
    level = atom.get("level", 1)
    interviewed = session.get("interviewed_roles") or []
    if level <= 1:
        return True
    if level == 2:
        return len(interviewed) >= 1
    if level == 3:
        return len(interviewed) >= 2
    return True


async def _compute_allowed_info(
    role: dict,
    info_atoms: list,
    session: dict,
    history: list,
    current_message: str,
) -> tuple[list, bool]:
    """Compute facts this role is allowed to reveal in the current turn.

    Returns (allowed_info, had_unlock) where had_unlock is True when at least
    one previously-locked atom was unlocked during this turn.

    info_atoms is the single source of truth for the basic layer when present
    (professor edits are reflected here). Falls back to role.allowed_info for
    legacy playbooks that pre-date info_atoms.
    """
    if info_atoms:
        allowed = [
            a["fact"]
            for a in info_atoms
            if _info_atom_owned_by_role(a, role) and a.get("access") == "allowed"
        ]
    else:
        allowed = list(role.get("allowed_info", []))

    locked_atoms = [
        a
        for a in info_atoms
        if _info_atom_owned_by_role(a, role) and a.get("access") == "locked"
    ]
    pending = [
        (a, a.get("unlock_condition", ""))
        for a in locked_atoms
        if a.get("unlock_condition") and _level_gate_passed(a, session)
    ]
    if not pending:
        return allowed, False

    conditions = [cond for _, cond in pending]
    results = await _check_conditions_batch(conditions, session, history, current_message)
    had_unlock = False
    for (atom, _), is_met in zip(pending, results):
        if is_met:
            allowed.append(atom["fact"])
            had_unlock = True

    return allowed, had_unlock


# Step 3 (post): Extract evidence from reply

async def _extract_evidence(reply: str, role_name: str, visible: bool = False) -> list:
    """Extract decision-relevant evidence items from an agent reply.

    visible=True means this evidence was unlocked this turn and should be
    displayed on the Evidence Board immediately. visible=False items are saved
    but hidden until an unlock event occurs.
    """
    prompt = f"""Extract key factual claims from this stakeholder response in a business case simulation.

Role: {role_name}
Response: "{reply}"

Return a JSON array. Each item must have:
- "key_info": one-sentence summary of the fact
- "data": the specific number or quote (empty string if none)
- "risk": the business risk implied (empty string if none)

Only extract concrete facts that would matter to a business decision.
Return [] if nothing concrete was stated.
Return ONLY valid JSON with no markdown or explanation."""

    raw = await _llm(prompt, max_tokens=600)
    evidence = _parse_evidence(raw, role_name, visible=visible)
    if evidence:
        return evidence
    return _fallback_extract_evidence(reply, role_name, visible=visible)


def _parse_evidence(raw: str, role_name: str, visible: bool = False) -> list:
    """Parse, validate, and deduplicate evidence JSON from the extractor."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        items = json.loads(text)
    except json.JSONDecodeError:
        return []

    if not isinstance(items, list):
        return []

    evidence = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue

        key_info = str(item.get("key_info", "")).strip()
        data = str(item.get("data", "")).strip()
        risk = str(item.get("risk", "")).strip()
        if not _is_valid_evidence(key_info, data, risk):
            continue

        normalized_key = (role_name, _normalize_text(key_info))
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        evidence.append(
            {
                "source": role_name,
                "key_info": key_info,
                "data": data,
                "risk": risk,
                "visible": visible,
            }
        )

    return evidence


def _is_valid_evidence(key_info: str, data: str, risk: str) -> bool:
    """Return whether an evidence item is concrete enough to store."""
    if len(key_info.split()) < 4:
        return False
    if key_info.lower() in {"market is risky", "there is risk", "risk exists"}:
        return False
    return bool(data or risk or re.search(r"\d", key_info))


def _fallback_extract_evidence(reply: str, role_name: str, visible: bool = False) -> list:
    """Extract a small amount of evidence without an LLM when extraction fails."""
    if not reply.strip() or reply.strip() == FALLBACK_REPLY:
        return []

    evidence = []
    seen = set()
    for sentence in _evidence_candidate_sentences(reply):
        data = _extract_data_fragment(sentence)
        risk = _infer_risk_fragment(sentence)
        if not _is_valid_evidence(sentence, data, risk):
            continue

        key = _normalize_text(sentence)
        if key in seen:
            continue
        seen.add(key)
        evidence.append(
            {
                "source": role_name,
                "key_info": sentence,
                "data": data,
                "risk": risk,
                "visible": visible,
            }
        )
        if len(evidence) >= 3:
            break

    return evidence


def _evidence_candidate_sentences(reply: str) -> list[str]:
    """Return reply sentences likely to contain concrete decision evidence."""
    normalized = re.sub(r"\s+", " ", reply.replace("\n", " ")).strip()
    candidates = re.split(r"(?<=[.!?])\s+", normalized)
    signal = re.compile(
        r"(\$|%|\d|cost|revenue|runway|margin|break-even|tender|license|"
        r"regulation|compliance|operator|fleet|vandalism|theft|attrition|"
        r"charging|staffing|rebalancing)",
        flags=re.IGNORECASE,
    )
    return [
        sentence.strip(" -")
        for sentence in candidates
        if len(sentence.split()) >= 5 and signal.search(sentence)
    ]


def _extract_data_fragment(sentence: str) -> str:
    """Extract the most useful numeric fragment from an evidence sentence."""
    matches = re.findall(
        r"(?:\$[\d,.]+[MBK]?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:months?|years?|operators?|licenses?|rides?))",
        sentence,
        flags=re.IGNORECASE,
    )
    return ", ".join(match.rstrip(".,;:") for match in matches[:3])


def _infer_risk_fragment(sentence: str) -> str:
    """Infer a conservative risk label for fallback evidence."""
    lower = sentence.lower()
    if any(term in lower for term in ("cost", "revenue", "runway", "margin", "break-even")):
        return "Financial viability risk."
    if any(term in lower for term in ("tender", "license", "regulation", "compliance", "operator")):
        return "Market access or compliance risk."
    if any(term in lower for term in ("fleet", "vandalism", "theft", "attrition", "charging", "staffing", "rebalancing")):
        return "Execution risk requiring operational mitigation."
    return ""


def _coerce_evidence_list(value: object) -> list:
    """Support both the current list contract and older single-item callers."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [value]
    return []


# Step 4: Checklist evaluation

async def _check_checklist_items(
    checklist_items: list,
    already_completed: list[int],
    session: dict,
    history: list,
    current_message: str,
) -> list[int]:
    """Return updated list of completed checklist item indices.

    Evaluates only items not yet completed.
    """
    completed = list(already_completed)
    completed_set = set(completed)

    pending = [
        (idx, item.get("completion_condition", ""))
        for idx, item in enumerate(checklist_items)
        if idx not in completed_set and item.get("completion_condition")
    ]
    if not pending:
        return completed

    conditions = [cond for _, cond in pending]
    results = await _check_conditions_batch(conditions, session, history, current_message)
    for (idx, _), is_met in zip(pending, results):
        if is_met:
            completed.append(idx)

    return completed


# Step 5: Sufficiency check

def _is_info_sufficient(session: dict) -> bool:
    """Return whether the session has enough interviews and evidence."""
    roles_visited = len(session.get("interviewed_roles") or [])
    evidence_count = len(session.get("evidence_board") or [])
    return roles_visited >= _MIN_ROLES and evidence_count >= _MIN_EVIDENCE


def _canonical_role_label(label: str) -> str:
    """Normalize a user-facing role label to the canonical role name."""
    role_type = canonical_role_type(label)
    if role_type:
        return role_type

    normalized = label.strip().lower()
    for canonical, aliases in ROLE_ALIASES.items():
        alias_values = {canonical.lower(), *(alias.lower() for alias in aliases)}
        if normalized in alias_values:
            return canonical
    return label.strip()


def _role_matches(role: dict, target_role: str) -> bool:
    """Return whether a playbook role matches the requested role label."""
    target = _canonical_role_label(target_role)
    candidates = [
        _canonical_role_label(str(role.get("name", ""))),
        _canonical_role_label(str(role.get("title", ""))),
        _canonical_role_label(str(role.get("role_type", ""))),
    ]
    return target.lower() in {candidate.lower() for candidate in candidates if candidate}


def _find_role(roles: list, target_role: str) -> dict | None:
    """Find a role config in the playbook using English or Chinese labels."""
    return next(
        (role for role in roles if _role_label_matches(role, target_role)),
        None,
    ) or next((role for role in roles if _role_matches(role, target_role)), None)


def _role_label_matches(role: dict, target_role: str) -> bool:
    """Return whether a role matches by exact display label."""
    target = normalize_label(target_role)
    candidates = {
        normalize_label(role.get("name")),
        normalize_label(role.get("title")),
        normalize_label(role.get("role_type")),
    }
    return bool(target and target in candidates)


_GUIDE_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
    "have", "in", "is", "it", "of", "on", "or", "the", "this", "to", "with",
    "that", "was", "were", "its", "their", "they", "will", "would", "could",
    "should", "not", "but", "our", "we", "which", "about", "how", "why",
    "what", "when", "who", "if",
}


def _word_set(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower()) if w not in _GUIDE_STOPWORDS and len(w) > 2}


def _follow_up_already_used(session: dict, role_name: str, mode: str, target: str) -> bool:
    """Return whether a (mode, target) pair was already issued for this role."""
    history = (session.get("follow_up_history") or {}).get(role_name, [])
    return any(e["mode"] == mode and e["target"] == target for e in history)


def _get_last_follow_up(session: dict, role_name: str) -> dict | None:
    """Return the most recently issued follow-up entry for this role."""
    history = (session.get("follow_up_history") or {}).get(role_name, [])
    return history[-1] if history else None


def _student_approaching_atom(atom: dict, msg_words: set[str]) -> bool:
    """Return True if the student's message is already heading toward this atom's domain.

    When approaching, the student will naturally unlock the atom by asking — no probe needed.
    When NOT approaching, the agent should guide them there with an unlock_probe.
    """
    domain = _atom_domain_paraphrase(atom)
    domain_words = _word_set(domain)
    if not domain_words:
        return False
    return len(domain_words & msg_words) / len(domain_words) >= 0.25


def _atom_domain_paraphrase(atom: dict) -> str:
    """Derive a safe domain hint from an atom's unlock condition without quoting the fact."""
    unlock = atom.get("unlock_condition", "").strip()
    # Strip leading "Student asks/must/needs" boilerplate
    cleaned = re.sub(
        r"^student\s+(?:asks?|must|needs?\s+to|demonstrates?|shows?|provides?|questions?)\s*(?:specifically\s*)?(?:about\s*)?",
        "",
        unlock,
        flags=re.IGNORECASE,
    ).strip()
    # Strip leading connector words
    cleaned = re.sub(r"^(?:about|whether|if|the|that|how|why|what)\s+", "", cleaned, flags=re.IGNORECASE)
    # Truncate at cross-agent prerequisites (", AND must have already interviewed...")
    cleaned = re.split(r"[,;]\s*(?:AND\s+)?must\s+have", cleaned, flags=re.IGNORECASE)[0].strip()
    return cleaned or "a deeper dimension of this topic"


def _already_unlocked(atom: dict, evidence_board: list) -> bool:
    """Return whether an atom's content appears on the visible evidence board."""
    fact_words = {w for w in re.findall(r"\w+", atom.get("fact", "").lower()) if len(w) > 3}
    if not fact_words:
        return False
    for item in evidence_board:
        if not item.get("visible", False):
            continue
        item_text = f"{item.get('key_info', '')} {item.get('data', '')}"
        item_words = {w for w in re.findall(r"\w+", item_text.lower()) if len(w) > 3}
        if item_words and len(fact_words & item_words) / max(len(fact_words), 1) >= 0.50:
            return True
    return False


def _challenge_owned_by_role(challenge: dict, role: dict) -> bool:
    """Return whether a calculation challenge belongs to this role."""
    owners = {_canonical_role_label(str(o)) for o in (challenge.get("owner_roles") or [])}
    role_labels = {
        _canonical_role_label(str(role.get("name", ""))),
        _canonical_role_label(str(role.get("title", ""))),
        _canonical_role_label(str(role.get("role_type", ""))),
    }
    return bool(role_labels & owners)


def _required_data_on_board(required_data: list, evidence_board: list, role_name: str) -> bool:
    """Return True when every required_data label has a fuzzy match on the board."""
    role_evidence = [item for item in evidence_board if item.get("source") == role_name]
    for label in required_data:
        label_words = _word_set(label)
        if not label_words:
            continue
        found = any(
            len(label_words & _word_set(f"{e.get('key_info', '')} {e.get('data', '')}"))
            / max(len(label_words), 1) >= 0.40
            for e in role_evidence
        )
        if not found:
            return False
    return True


def _checklist_item_for_role(item: dict, role: dict) -> bool:
    """Return True if this item is owned by this role or has no role assignment."""
    suggested = item.get("suggested_roles") or []
    if not suggested:
        return True
    role_labels = {
        (role.get("name") or "").lower(),
        (role.get("role_type") or "").lower(),
    }
    return any(s.lower() in role_labels for s in suggested)


def _stage_description(role_history: list) -> str:
    count = len(role_history)
    if count == 0:
        return "Opening turn — no prior exchanges"
    if count == 1:
        return "Early conversation — 1 exchange so far"
    if count <= 4:
        return f"Mid-conversation — {count} exchange(s) so far"
    return f"Deep conversation — {count} exchanges so far"


def _select_guide_strategy(
    role: dict,
    session: dict,
    playbook: dict,
    role_history: list,
    current_student_message: str,
) -> dict:
    """Select the highest-priority follow-up mode for the current turn.

    Returns a GuideContext dict with mode and all data needed for the prompt block.
    role_history is the subset of messages for this role's conversation thread.
    """
    role_name = role.get("name", "")
    info_atoms: list = playbook.get("info_atoms") or []
    checklist_items: list = playbook.get("checklist_items") or []
    calculation_challenges: list = playbook.get("calculation_challenges") or []
    evidence_board: list = session.get("evidence_board") or []
    completed_set = set(session.get("checklist_completed") or [])
    stage = _stage_description(role_history)
    msg_words = _word_set(current_student_message)

    # Priority 1: Validation
    # Use follow_up_history to check if last issued follow-up was a calculation_challenge.
    last_followup = _get_last_follow_up(session, role_name)
    if (
        last_followup
        and last_followup["mode"] == "calculation_challenge"
        and re.search(r"\d|%|\$", current_student_message)
    ):
        last_metric = last_followup["target"]
        challenge = next(
            (c for c in calculation_challenges if c.get("metric") == last_metric),
            None,
        )
        available_data = [
            item["key_info"]
            for item in evidence_board
            if item.get("source") == role_name
        ]
        return {
            "mode": "validation",
            "target_description": last_metric,
            "available_data": available_data,
            "formula_hint": (challenge or {}).get("formula_hint", ""),
            "expected_insight": (challenge or {}).get("expected_insight", ""),
            "target_roles": [],
            "uncompleted_checklist_hints": [],
            "stage_description": stage,
            "priority_rationale": "Last follow-up was calculation_challenge; student provided numerical result",
        }

    # Priority 2: Unlock probe
    unlockable = [
        a for a in info_atoms
        if _info_atom_owned_by_role(a, role)
        and a.get("access") == "locked"
        and _level_gate_passed(a, session)
        and not _already_unlocked(a, evidence_board)
        and not _follow_up_already_used(session, role_name, "unlock_probe", _atom_domain_paraphrase(a))
        and not _student_approaching_atom(a, msg_words)
    ]
    if unlockable:
        # Prefer lowest level first
        unlockable.sort(key=lambda a: a.get("level", 1))
        atom = unlockable[0]
        domain = _atom_domain_paraphrase(atom)
        return {
            "mode": "unlock_probe",
            "target_description": domain,
            "available_data": [],
            "formula_hint": "",
            "expected_insight": "",
            "target_roles": [],
            "uncompleted_checklist_hints": [],
            "stage_description": stage,
            "priority_rationale": f"Unlockable atom at level {atom.get('level', 1)}; level gate passed",
        }

    # Priority 3: Calculation challenge
    available_challenges = [
        c for c in calculation_challenges
        if _challenge_owned_by_role(c, role)
        and _required_data_on_board(c.get("required_data", []), evidence_board, role_name)
        and not _follow_up_already_used(session, role_name, "calculation_challenge", c["metric"])
    ]
    if available_challenges:
        challenge = available_challenges[0]
        available_data = [
            item["key_info"]
            for item in evidence_board
            if item.get("source") == role_name
        ]
        return {
            "mode": "calculation_challenge",
            "target_description": challenge["metric"],
            "available_data": available_data,
            "formula_hint": challenge.get("formula_hint", ""),
            "expected_insight": challenge.get("expected_insight", ""),
            "target_roles": [],
            "uncompleted_checklist_hints": [],
            "stage_description": stage,
            "priority_rationale": "Required data on board; challenge not yet issued",
        }

    # Priority 4: Checklist probe
    uncompleted = [
        item for i, item in enumerate(checklist_items)
        if i not in completed_set
        and _checklist_item_for_role(item, role)
        and not _follow_up_already_used(session, role_name, "checklist_probe", item["task"])
    ]
    if uncompleted:
        hints = [item["task"] for item in uncompleted[:3]]
        return {
            "mode": "checklist_probe",
            "target_description": hints[0],
            "available_data": [],
            "formula_hint": "",
            "expected_insight": "",
            "target_roles": [],
            "uncompleted_checklist_hints": hints,
            "stage_description": stage,
            "priority_rationale": f"{len(uncompleted)} uncompleted checklist item(s) for this role",
        }

    # Priority 5: Cross-role referral
    # Compare overlap against the CANDIDATE role's domain, not the current role.
    uncompleted_all = [
        item for i, item in enumerate(checklist_items)
        if i not in completed_set
    ]
    referral_candidates: list[tuple[dict, dict]] = []
    seen_candidates: set[str] = set()
    for item in uncompleted_all:
        for suggested_name in item.get("suggested_roles", []):
            candidate = _find_role(playbook.get("roles", []), suggested_name)
            if not candidate or candidate["name"] == role_name:
                continue
            if candidate["name"] in seen_candidates:
                continue
            task_words = _word_set(item.get("task", ""))
            candidate_focus_words = _word_set(candidate.get("focus_area", ""))
            all_relevant = task_words
            if all_relevant:
                msg_overlap = len(task_words & msg_words) / len(all_relevant)
                focus_overlap = len(task_words & candidate_focus_words) / len(all_relevant)
                if msg_overlap >= 0.30 or focus_overlap >= 0.30:
                    referral_candidates.append((candidate, item))
                    seen_candidates.add(candidate["name"])

    if referral_candidates:
        target_names = [c["name"] for c, _ in referral_candidates[:2]]
        return {
            "mode": "cross_role_referral",
            "target_description": ", ".join(target_names),
            "available_data": [],
            "formula_hint": "",
            "expected_insight": "",
            "target_roles": target_names,
            "uncompleted_checklist_hints": [],
            "stage_description": stage,
            "priority_rationale": "Structured suggested_roles points to other agents with relevant domain",
        }

    # Priority 6: Deepen (fallback)
    return {
        "mode": "deepen",
        "target_description": "",
        "available_data": [],
        "formula_hint": "",
        "expected_insight": "",
        "target_roles": [],
        "uncompleted_checklist_hints": [],
        "stage_description": stage,
        "priority_rationale": "No higher-priority trigger found",
    }


def _info_atom_owned_by_role(atom: dict, role: dict) -> bool:
    """Return whether an info atom belongs to this role by name or role_type."""
    owners = atom.get("owner_roles") or []
    role_labels = {
        _canonical_role_label(str(role.get("name", ""))),
        _canonical_role_label(str(role.get("title", ""))),
    }
    inferred_type = infer_role_type(role)
    if inferred_type:
        role_labels.add(inferred_type)

    owner_labels = {_canonical_role_label(str(owner)) for owner in owners}
    return bool(role_labels & owner_labels)


# ── Mission-based CEO orchestration ─────────────────────────────────────────

_REPORT_PHRASES = {
    "i found", "they told me", "according to", "he said", "she said",
    "the director said", "the cfo said", "the operations", "the customer",
    "i learned", "i was told", "it turns out", "the agent said",
    "they mentioned", "i discovered", "turns out", "from the",
}


def _is_ceo_role(role_name: str) -> bool:
    return canonical_role_type(role_name) == "strategy"


def _is_student_reporting(message: str) -> bool:
    if len(message.split()) >= 40:
        return True
    lower = message.lower()
    return any(phrase in lower for phrase in _REPORT_PHRASES)


def _parse_mission_verdict(text: str) -> str:
    """Extract mission verdict tag; default to INCOMPLETE when missing/malformed
    so a CEO reply that forgets the tag never silently advances the student."""
    match = re.search(
        r"<mission_verdict>(COMPLETE|INCOMPLETE)</mission_verdict>",
        text,
        re.IGNORECASE,
    )
    return match.group(1).upper() if match else "INCOMPLETE"


def _strip_mission_verdict(text: str) -> str:
    return re.sub(
        r"\s*<mission_verdict>.*?</mission_verdict>",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()


def _agent_is_active(role_name: str, active_agents: list) -> bool:
    role_type = canonical_role_type(role_name)
    role_lower = role_name.lower().strip()
    for agent in active_agents:
        if agent.lower().strip() == role_lower:
            return True
        agent_type = canonical_role_type(agent)
        if role_type and agent_type and role_type == agent_type:
            return True
    return False


def _build_roles_summary(roles: list) -> str:
    """Build a readable stakeholder list from playbook roles."""
    lines = []
    for r in roles:
        name = r.get("name", "")
        title = r.get("title", "")
        focus = r.get("focus_area", "")
        lines.append(f"- {name} ({title}): {focus}")
    return "\n".join(lines)


def _build_ceo_orchestrator_prompt(
    mode: str,
    current_idx: int,
    roles: list,
    raw_content: str,
    ceo_role: dict | None,
    mission_state: dict,
    evidence_board: list | None = None,
) -> str:
    from agents.missions import MISSION_COUNT

    name = (ceo_role or {}).get("name", "CEO")
    title = (ceo_role or {}).get("title", "Chief Executive Officer")
    roles_summary = _build_roles_summary(roles)
    missions_done = len(mission_state.get("missions_completed") or [])
    # Truncate raw content to avoid token overload
    case_excerpt = (raw_content or "")[:1200].strip()

    if mode == "BRIEFING":
        already_investigated = ", ".join(
            r for r in (mission_state.get("interviewed_roles_by_mission") or [])
        ) or "nothing yet"

        mode_block = (
            "Write a mission briefing for a student consultant. "
            "Match the style, tone, and length of the two examples below — "
            "same executive voice, same paragraph structure, same level of specificity. "
            "Do not copy the examples. Generate a fresh briefing based on the case context provided.\n\n"

            "--- EXAMPLE 1 ---\n"
            "Good. Let's start with how Marriott actually operates.\n\n"
            "Before we evaluate cost of capital, we need to understand whether the different "
            "divisions are facing the same business conditions. Lodging, contract services, "
            "and restaurants may look like one company from the outside, but internally they "
            "may have very different risk, growth, and capital needs.\n\n"
            "For this round, speak with the Operations Director. Your task is to understand "
            "how the major divisions differ operationally.\n\n"
            "When you come back, I want a short diagnosis with two parts:\n"
            "the main operational differences across divisions;\n"
            "why those differences may matter for investment evaluation.\n\n"

            "--- EXAMPLE 2 ---\n"
            "Good. Start with the operating side.\n\n"
            "Marriott's growth has created a more complex company than it used to be. "
            "Before we make any financial judgment, I need you to find out whether our "
            "divisions are similar enough to be evaluated under one standard.\n\n"
            "Talk with the Operations Director first. Focus on how the businesses differ "
            "in their day-to-day operations, capital needs, growth patterns, and risk exposure.\n\n"
            "Bring back a brief summary of the top 2-3 differences you find, plus your view "
            "on whether those differences could affect Marriott's cost of capital decision.\n\n"

            "--- NOW WRITE THE BRIEFING ---\n"
            f"This is Mission {current_idx + 1} of {MISSION_COUNT}.\n"
            f"Missions completed so far: {missions_done}\n\n"
            f"Case context (use this to determine what to investigate):\n{case_excerpt}\n\n"
            f"Available stakeholders the student can speak with:\n{roles_summary}\n\n"
            "Your task: decide what the most important thing to investigate at this stage is, "
            "which stakeholder(s) to send the student to, and what specific deliverable to request.\n\n"
            "Rules:\n"
            "- Open with 'Good.' followed by one short direction-setting sentence\n"
            "- 1-2 sentences of strategic framing (why this investigation matters now)\n"
            "- Name the stakeholder(s) to speak with and what to focus on\n"
            "- End with a specific 'bring back' request\n"
            "- Do NOT mention other missions\n"
            "- Total: 4-6 sentences across 3-4 short paragraphs"
        )

    elif mode == "EVALUATING":
        is_last = (current_idx + 1) >= MISSION_COUNT
        if is_last:
            next_assignment = (
                "All missions are complete. Briefly congratulate them and tell them "
                "they have enough to form a recommendation. "
                "End with: <mission_verdict>COMPLETE</mission_verdict>"
            )
        else:
            next_assignment = (
                f"Introduce Mission {current_idx + 2} of {MISSION_COUNT} in the same style as the examples above — "
                "decide the next logical investigation area based on the case context, "
                "name the appropriate stakeholder(s), and state the deliverable. "
                "Then end with: <mission_verdict>COMPLETE</mission_verdict>"
            )

        # Build evidence the student actually collected this mission — used as
        # ground truth for fact-checking any numbers/claims in their report.
        active_sources = {
            r for r in (mission_state.get("active_agents") or [])
            if r and r.lower() != "ceo"
        }
        relevant_evidence = [
            e for e in (evidence_board or [])
            if not active_sources or e.get("source") in active_sources
        ]
        if not relevant_evidence:
            relevant_evidence = list(evidence_board or [])[:15]
        else:
            relevant_evidence = relevant_evidence[:15]

        if relevant_evidence:
            evidence_text = "\n".join(
                f"- [{e.get('source', '?')}] {e.get('key_info', '')}"
                + (f" (data: {e.get('data')})" if e.get("data") else "")
                for e in relevant_evidence
            )
        else:
            evidence_text = (
                "NO EVIDENCE COLLECTED YET. The student has not actually interviewed "
                "the required stakeholder(s). Any specific facts or numbers in their "
                "report are fabricated."
            )

        mode_block = (
            f"The student has reported back on Mission {current_idx + 1} of {MISSION_COUNT}.\n\n"
            "Look at your previous briefing in the conversation history — that is what you asked for. "
            "Evaluate whether the student's report covers it AND whether the specific "
            "facts/numbers they cite are actually supported by the evidence they collected.\n\n"
            f"Evidence the student actually collected from interviews:\n{evidence_text}\n\n"
            "Fact-check rules (apply strictly):\n"
            "- If the report cites a specific number, percentage, or named fact that does NOT "
            "appear in the evidence above, mark INCOMPLETE and tell them to recheck with the stakeholder.\n"
            "- If the report makes confident claims but no relevant evidence was collected, mark INCOMPLETE.\n"
            "- Vague qualitative statements consistent with the evidence are acceptable.\n\n"
            "If COMPLETE (report covers the briefing AND cited facts are grounded in evidence):\n"
            "  - Confirm what they got right (1 sentence).\n"
            f"  - {next_assignment}\n\n"
            "If INCOMPLETE (missing coverage OR fabricated/unsupported numbers):\n"
            "  - Name exactly what is missing or which figure is unsupported.\n"
            "  - Tell them which stakeholder to go back to and what to ask.\n"
            "  - End with: <mission_verdict>INCOMPLETE</mission_verdict>\n\n"
            f"Case context:\n{case_excerpt}\n\n"
            f"Available stakeholders:\n{roles_summary}\n\n"
            "Tone: direct mentor. 4-6 sentences total. Do not ask a question."
        )

    else:  # REDIRECTING
        mode_block = (
            "The student sent you a message while they are still on an active mission. "
            "Look at your previous briefing in the conversation history. "
            "Briefly remind them of what they still need to collect and bring back. "
            "Maximum 2 sentences. Do not ask a question."
        )

    return (
        f"You are {name}, {title}, coordinating a student investigation of this business case.\n\n"
        f"{mode_block}\n\n"
        "Core rules:\n"
        "- Use direct, executive language. No pleasantries.\n"
        "- Never ask the student a question — your role is to direct and evaluate.\n"
        f"- Stay in character as {name}."
    )


async def _extract_mission_brief(reply: str) -> dict:
    """Extract a one-sentence task and handoff from a CEO briefing message."""
    prompt = (
        f"CEO message: \"{reply[:800]}\"\n\n"
        "From this CEO briefing, extract:\n"
        "1. task: one sentence describing what to investigate\n"
        "2. handoff: one sentence describing what the student should bring back to the CEO\n\n"
        "Reply with ONLY valid JSON: {\"task\": \"...\", \"handoff\": \"...\"}"
    )
    raw = await _llm(prompt, max_tokens=120)
    try:
        result = json.loads(raw.strip())
        if isinstance(result, dict) and "task" in result and "handoff" in result:
            return result
    except (json.JSONDecodeError, ValueError):
        pass
    return {}


async def _extract_active_roles(reply: str, roles: list) -> list[str]:
    """Extract which role names the CEO assigned in its briefing reply."""
    if not roles:
        return []
    role_names = [r["name"] for r in roles]
    prompt = (
        f"CEO message: \"{reply}\"\n\n"
        f"Available roles: {', '.join(role_names)}\n\n"
        "Which roles from the available list did the CEO direct the student to speak with? "
        "Reply with ONLY a JSON array of exact role names, e.g. [\"CFO\"]. "
        "Return [] if none are clearly assigned."
    )
    raw = await _llm(prompt, max_tokens=80)
    try:
        result = json.loads(raw.strip())
        if isinstance(result, list):
            return [r for r in result if r in role_names]
    except (json.JSONDecodeError, ValueError):
        pass
    return []


async def handle_ceo_message(
    session_id: str,
    session: dict,
    playbook: dict,
    history: list,
    student_message: str,
    raw_content: str = "",
) -> dict:
    from agents.missions import MISSION_COUNT

    mission_state = dict(session.get("mission_state") or {})
    current_idx = int(mission_state.get("current_mission", 0))
    phase = mission_state.get("phase", "briefing")

    if phase == "briefing":
        mode = "BRIEFING"
    elif phase == "investigating":
        mode = "EVALUATING" if _is_student_reporting(student_message) else "REDIRECTING"
    else:
        mode = "REDIRECTING"

    roles = playbook.get("roles") or []
    ceo_role = _find_role(roles, "CEO")
    ceo_name = (ceo_role or {}).get("name", "CEO")

    evidence_board: list = session.get("evidence_board") or []
    system_prompt = _build_ceo_orchestrator_prompt(
        mode, current_idx, roles, raw_content, ceo_role, mission_state, evidence_board
    )

    raw_reply = await chat(
        system_prompt,
        student_message,
        history=history[-12:],
        max_tokens=600,
        temperature=0.7,
    )

    verdict = _parse_mission_verdict(raw_reply)
    reply = _strip_mission_verdict(raw_reply)

    new_mission_state = dict(mission_state)

    summaries = dict(new_mission_state.get("mission_summaries") or {})

    if mode == "BRIEFING":
        assigned, brief = await asyncio.gather(
            _extract_active_roles(reply, roles),
            _extract_mission_brief(reply),
        )
        new_mission_state["phase"] = "investigating"
        new_mission_state["active_agents"] = list(dict.fromkeys(["CEO"] + assigned))
        if brief:
            summaries[str(current_idx)] = brief
            new_mission_state["mission_summaries"] = summaries

    elif mode == "EVALUATING" and verdict == "COMPLETE":
        completed = list(mission_state.get("missions_completed") or [])
        if current_idx not in completed:
            completed.append(current_idx)
        next_idx = current_idx + 1
        new_mission_state["missions_completed"] = completed
        if next_idx >= MISSION_COUNT:
            new_mission_state["phase"] = "complete"
            new_mission_state["active_agents"] = ["CEO"]
        else:
            # CEO already briefed next mission in this reply — extract assigned roles and brief
            assigned, brief = await asyncio.gather(
                _extract_active_roles(reply, roles),
                _extract_mission_brief(reply),
            )
            new_mission_state["current_mission"] = next_idx
            new_mission_state["phase"] = "investigating"
            new_mission_state["active_agents"] = list(dict.fromkeys(["CEO"] + assigned))
            if brief:
                summaries[str(next_idx)] = brief
                new_mission_state["mission_summaries"] = summaries

    if new_mission_state != mission_state:
        db.update_mission_state(session_id, new_mission_state)

    db.save_message(session_id, "student", student_message, ceo_name)
    db.save_message(session_id, "agent", reply, ceo_name)
    db.add_interviewed_role(session_id, ceo_name)

    current_roles = list(session.get("interviewed_roles") or [])
    if ceo_name not in current_roles:
        current_roles = current_roles + [ceo_name]

    return {
        "reply": reply,
        "new_evidence": [],
        "agent_name": ceo_name,
        "info_sufficient": new_mission_state.get("phase") == "complete",
        "roles_visited": current_roles,
        "newly_unlocked": False,
        "newly_checked_items": [],
        "checklist_completed": list(session.get("checklist_completed") or []),
        "unlock_check_ms": 0,
        "mission_state": new_mission_state,
    }


async def handle_student_message(
    target_role: str,
    user_message: str,
    history: list[dict],
    case_context: dict,
    extract_evidence: bool = True,
) -> dict:
    """Handle one student message using only Agent-layer inputs.

    This is the stable contract for the FastAPI/database layer to call. It does
    not read from or write to Supabase; callers own persistence.

    Args:
        target_role: Role requested by the student, such as ``CFO`` or
            ``Local Expert``.
        user_message: The student's latest message.
        history: Conversation history using app message roles.
        case_context: Case data containing ``playbook.roles`` and
            ``playbook.info_atoms``. May include ``session`` for unlock checks.

    Returns:
        A dict matching the Agent contract: ``reply``, ``evidence``, and
        ``agent_name``. ``evidence`` is a list of evidence items.
    """
    playbook = case_context.get("playbook") or {}
    roles: list = playbook.get("roles") or []
    info_atoms: list = playbook.get("info_atoms") or []
    session: dict = case_context.get("session") or {}
    raw_content: str = case_context.get("raw_content") or ""

    role = _find_role(roles, target_role)
    if role is None:
        return {
            "reply": FALLBACK_REPLY,
            "evidence": [],
            "agent_name": target_role,
            "role_found": False,
        }

    t0 = time.monotonic()
    allowed_info, had_unlock = await _compute_allowed_info(
        role, info_atoms, session, history, user_message
    )
    unlock_check_ms = int((time.monotonic() - t0) * 1000)

    # Determine follow-up guide strategy before calling the sub-agent
    role_history = [
        m for m in history
        if m.get("role") == "agent" and m.get("agent_name") == role["name"]
    ]
    guide_context = _select_guide_strategy(role, session, playbook, role_history, user_message)

    reply = await call_sub_agent(
        role, allowed_info, history, user_message,
        raw_content=raw_content,
        guide_context=guide_context,
        session=session,
    )

    evidence_items: list = []
    if extract_evidence:
        evidence_items = await _extract_evidence(reply, role["name"], visible=had_unlock)

    return {
        "reply": reply,
        "evidence": evidence_items,
        "agent_name": role["name"],
        "role_type": infer_role_type(role),
        "role_found": True,
        "newly_unlocked": had_unlock,
        "unlock_check_ms": unlock_check_ms,
        "guide_context": guide_context,
    }


# FastAPI adapter entry point

async def _background_post_process(
    session_id: str,
    session: dict,
    playbook: dict,
    reply: str,
    agent_name: str,
    had_unlock: bool,
    student_message: str,
) -> None:
    """Extract evidence and evaluate checklist after the reply is already returned.

    LLM calls run concurrently across sessions. The DB read-modify-write is
    serialized per session via _SESSION_WRITE_LOCKS to prevent concurrent
    background tasks from overwriting each other's evidence updates.
    """
    # LLM calls outside the lock — concurrent tasks can run these in parallel
    evidence_items = await _extract_evidence(reply, agent_name, visible=had_unlock)
    new_evidence = _coerce_evidence_list(evidence_items)

    checklist_items: list = playbook.get("checklist_items") or []
    already_completed: list = list(session.get("checklist_completed") or [])
    new_completed = already_completed
    if checklist_items:
        updated_history = db.get_messages(session_id)
        new_completed = await _check_checklist_items(
            checklist_items, already_completed, session, updated_history, student_message
        )

    # DB writes inside the lock — serialized per session
    async with _SESSION_WRITE_LOCKS[session_id]:
        db.update_evidence_and_roles(session_id, new_evidence, agent_name)
        newly_checked = [i for i in new_completed if i not in set(already_completed)]
        if newly_checked:
            db.update_checklist_completed(session_id, new_completed)


async def handle_message(
    session_id: str, role_name: str, student_message: str
) -> dict:
    """Handle a FastAPI session message and persist the Agent result."""
    session = db.get_session(session_id)
    if session is None:
        raise ValueError(f"Unknown session: {session_id!r}")

    playbook = db.get_playbook_by_case(session["case_id"])
    if playbook is None:
        raise ValueError(f"No approved playbook for case: {session['case_id']!r}")

    history = db.get_messages(session_id)
    case = db.get_case(session["case_id"])
    mission_state = session.get("mission_state") or {}

    # CEO path: handled by dedicated orchestrator
    if _is_ceo_role(role_name):
        return await handle_ceo_message(
            session_id, session, playbook, history, student_message,
            raw_content=(case or {}).get("raw_content", ""),
        )

    # Access control: only allow agents in the current active_agents list
    if mission_state:
        active_agents = mission_state.get("active_agents") or ["CEO"]
        if not _agent_is_active(role_name, active_agents):
            ceo_role = _find_role(playbook.get("roles") or [], "CEO")
            ceo_name = (ceo_role or {}).get("name", "CEO")
            return {
                "reply": (
                    f"You haven't been assigned to speak with {role_name} yet. "
                    f"Return to {ceo_name} for your next mission."
                ),
                "new_evidence": [],
                "agent_name": role_name,
                "info_sufficient": False,
                "roles_visited": list(session.get("interviewed_roles") or []),
                "newly_unlocked": False,
                "newly_checked_items": [],
                "checklist_completed": list(session.get("checklist_completed") or []),
                "unlock_check_ms": 0,
                "mission_state": mission_state,
            }

    # Critical path: unlock checks + agent reply only (no evidence extraction)
    result = await handle_student_message(
        target_role=role_name,
        user_message=student_message,
        history=history,
        case_context={
            "case_id": session["case_id"],
            "playbook": playbook,
            "session": session,
            "raw_content": (case or {}).get("raw_content", ""),
        },
        extract_evidence=False,
    )
    reply = result["reply"]
    agent_name = result["agent_name"]
    guide_context = result.get("guide_context")

    # Persist messages immediately so history stays consistent
    db.save_message(session_id, "student", student_message, agent_name)
    db.save_message(session_id, "agent", reply, agent_name)

    # Persist follow-up history synchronously — do not defer to background.
    if guide_context and guide_context.get("mode"):
        follow_up_history = dict(session.get("follow_up_history") or {})
        role_list = list(follow_up_history.get(agent_name, []))
        role_list.append({
            "mode": guide_context["mode"],
            "target": guide_context.get("target_description", ""),
        })
        follow_up_history[agent_name] = role_list
        db.update_follow_up_history(session_id, follow_up_history)

    # Evidence extraction + checklist + DB writes all happen in the background.
    # Role registration is also done there (inside the per-session write lock).
    asyncio.create_task(_background_post_process(
        session_id, session, playbook, reply, agent_name,
        result.get("newly_unlocked", False), student_message,
    ))

    # Compute roles_visited locally so the response is accurate without a DB round-trip
    current_roles = list(session.get("interviewed_roles") or [])
    if result.get("role_found", True) and agent_name not in current_roles:
        current_roles = current_roles + [agent_name]

    return {
        "reply": reply,
        "new_evidence": [],
        "agent_name": agent_name,
        "info_sufficient": _is_info_sufficient({**session, "interviewed_roles": current_roles}),
        "roles_visited": current_roles,
        "newly_unlocked": result.get("newly_unlocked", False),
        "newly_checked_items": [],
        "checklist_completed": list(session.get("checklist_completed") or []),
        "unlock_check_ms": result.get("unlock_check_ms", 0),
        "mission_state": mission_state,
    }


async def handle_message_stream(session_id: str, role_name: str, student_message: str):
    """Yield SSE event dicts for a streaming session message.

    Events in order:
      {"type": "unlock_done", "unlock_check_ms": N}
      {"type": "token", "content": "..."}   (repeated)
      {"type": "done", "agent_name": ..., "roles_visited": ..., ...}
    """
    session = db.get_session(session_id)
    if session is None:
        yield {"type": "error", "message": "Session not found"}
        return

    playbook = db.get_playbook_by_case(session["case_id"])
    if playbook is None:
        yield {"type": "error", "message": "No approved playbook"}
        return

    history = db.get_messages(session_id)
    case = db.get_case(session["case_id"])
    mission_state = session.get("mission_state") or {}

    # CEO path: run non-streaming, emit as tokens
    if _is_ceo_role(role_name):
        result = await handle_ceo_message(
            session_id, session, playbook, history, student_message,
            raw_content=(case or {}).get("raw_content", ""),
        )
        yield {"type": "unlock_done", "unlock_check_ms": 0}
        yield {"type": "token", "content": result["reply"]}
        yield {
            "type": "done",
            "agent_name": result["agent_name"],
            "roles_visited": result["roles_visited"],
            "info_sufficient": result["info_sufficient"],
            "newly_unlocked": False,
            "checklist_completed": result["checklist_completed"],
            "unlock_check_ms": 0,
            "mission_state": result["mission_state"],
        }
        return

    # Access control
    if mission_state:
        active_agents = mission_state.get("active_agents") or ["CEO"]
        if not _agent_is_active(role_name, active_agents):
            ceo_role = _find_role(playbook.get("roles") or [], "CEO")
            ceo_name = (ceo_role or {}).get("name", "CEO")
            lock_msg = (
                f"You haven't been assigned to speak with {role_name} yet. "
                f"Return to {ceo_name} for your next mission."
            )
            yield {"type": "unlock_done", "unlock_check_ms": 0}
            yield {"type": "token", "content": lock_msg}
            yield {
                "type": "done",
                "agent_name": role_name,
                "roles_visited": list(session.get("interviewed_roles") or []),
                "info_sufficient": False,
                "newly_unlocked": False,
                "checklist_completed": list(session.get("checklist_completed") or []),
                "unlock_check_ms": 0,
                "mission_state": mission_state,
            }
            return

    roles: list = playbook.get("roles") or []
    info_atoms: list = playbook.get("info_atoms") or []
    raw_content: str = (case or {}).get("raw_content", "")

    role = _find_role(roles, role_name)
    if role is None:
        yield {"type": "unlock_done", "unlock_check_ms": 0}
        yield {"type": "token", "content": FALLBACK_REPLY}
        current_roles = list(session.get("interviewed_roles") or [])
        yield {
            "type": "done",
            "agent_name": role_name,
            "roles_visited": current_roles,
            "info_sufficient": False,
            "newly_unlocked": False,
            "checklist_completed": list(session.get("checklist_completed") or []),
            "unlock_check_ms": 0,
        }
        return

    # Phase 1: unlock condition check + guide strategy selection
    t0 = time.monotonic()
    allowed_info, had_unlock = await _compute_allowed_info(
        role, info_atoms, session, history, student_message
    )
    unlock_check_ms = int((time.monotonic() - t0) * 1000)
    yield {"type": "unlock_done", "unlock_check_ms": unlock_check_ms}

    role_history = [
        m for m in history
        if m.get("role") == "agent" and m.get("agent_name") == role["name"]
    ]
    guide_context = _select_guide_strategy(role, session, playbook, role_history, student_message)

    # Phase 2: stream reply tokens
    agent_name = role["name"]
    full_reply = ""
    async for chunk in stream_sub_agent(
        role, allowed_info, history, student_message,
        raw_content=raw_content,
        guide_context=guide_context,
        session=session,
    ):
        full_reply += chunk
        yield {"type": "token", "content": chunk}

    # Persist messages and follow-up history synchronously before background tasks
    db.save_message(session_id, "student", student_message, agent_name)
    db.save_message(session_id, "agent", full_reply, agent_name)

    if guide_context and guide_context.get("mode"):
        follow_up_history = dict(session.get("follow_up_history") or {})
        role_list = list(follow_up_history.get(agent_name, []))
        role_list.append({
            "mode": guide_context["mode"],
            "target": guide_context.get("target_description", ""),
        })
        follow_up_history[agent_name] = role_list
        db.update_follow_up_history(session_id, follow_up_history)

    asyncio.create_task(_background_post_process(
        session_id, session, playbook, full_reply, agent_name, had_unlock, student_message
    ))

    current_roles = list(session.get("interviewed_roles") or [])
    if agent_name not in current_roles:
        current_roles = current_roles + [agent_name]

    yield {
        "type": "done",
        "agent_name": agent_name,
        "roles_visited": current_roles,
        "info_sufficient": _is_info_sufficient({**session, "interviewed_roles": current_roles}),
        "newly_unlocked": had_unlock,
        "checklist_completed": list(session.get("checklist_completed") or []),
        "unlock_check_ms": unlock_check_ms,
        "mission_state": mission_state,
    }
