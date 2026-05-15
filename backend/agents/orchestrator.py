from __future__ import annotations

import asyncio
import json
import re
import database as db
from agents.role_types import (
    canonical_role_type,
    infer_role_type,
    normalize_label,
    role_type_matches,
)
from agents.sub_agents import call_sub_agent
from llm_client import FALLBACK_REPLY, complete

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

async def _is_unlock_condition_met(
    condition: str, session: dict, history: list, current_message: str
) -> bool:
    """Return whether a locked information condition is satisfied."""
    recent = "\n".join(
        f"[{m['role'].upper()} / {m.get('agent_name', '')}]: {m['content']}"
        for m in history[-12:]
    )
    prompt = f"""You are evaluating whether an unlock condition in a business case simulation has been satisfied.

Unlock condition: "{condition}"

Roles the student has already interviewed: {session.get("interviewed_roles", [])}
Student's current message: "{current_message}"

Recent conversation:
{recent}

Has the unlock condition been met? Reply with only YES or NO."""

    result = await _llm(prompt, max_tokens=5)
    return result.upper().startswith("YES")


# Step 2: Build allowed_info for this turn

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
    pending = [(a, a.get("unlock_condition", "")) for a in locked_atoms if a.get("unlock_condition")]
    if not pending:
        return allowed, False

    results = await asyncio.gather(
        *[_is_unlock_condition_met(cond, session, history, current_message) for _, cond in pending]
    )
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

    results = await asyncio.gather(
        *[_is_unlock_condition_met(cond, session, history, current_message) for _, cond in pending]
    )
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


async def handle_student_message(
    target_role: str,
    user_message: str,
    history: list[dict],
    case_context: dict,
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

    allowed_info, had_unlock = await _compute_allowed_info(
        role, info_atoms, session, history, user_message
    )
    reply = await call_sub_agent(role, allowed_info, history, user_message, raw_content=raw_content)
    evidence_items = await _extract_evidence(reply, role["name"], visible=had_unlock)

    return {
        "reply": reply,
        "evidence": evidence_items,
        "agent_name": role["name"],
        "role_type": infer_role_type(role),
        "role_found": True,
        "newly_unlocked": had_unlock,
    }


# FastAPI adapter entry point

async def handle_message(
    session_id: str, role_name: str, student_message: str
) -> dict:
    """Handle a FastAPI session message and persist the Agent result."""
    # Load state from Supabase (no in-memory session state)
    session = db.get_session(session_id)
    if session is None:
        raise ValueError(f"Unknown session: {session_id!r}")

    playbook = db.get_playbook_by_case(session["case_id"])
    if playbook is None:
        raise ValueError(f"No approved playbook for case: {session['case_id']!r}")

    history = db.get_messages(session_id)

    case = db.get_case(session["case_id"])
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
    )
    reply = result["reply"]

    # 3 Extract evidence and persist
    new_evidence = _coerce_evidence_list(result.get("evidence"))
    agent_name = result["agent_name"]
    db.save_message(session_id, "student", student_message, agent_name)
    db.save_message(session_id, "agent", reply, agent_name)
    if result.get("role_found", True):
        db.update_evidence_and_roles(session_id, new_evidence, agent_name)

    # 4 Evaluate checklist progress
    checklist_items: list = playbook.get("checklist_items") or []
    already_completed: list = list(session.get("checklist_completed") or [])
    newly_checked: list[int] = []
    if checklist_items:
        updated_history = db.get_messages(session_id)
        new_completed = await _check_checklist_items(
            checklist_items, already_completed, session, updated_history, student_message
        )
        newly_checked = [i for i in new_completed if i not in set(already_completed)]
        if newly_checked:
            db.update_checklist_completed(session_id, new_completed)

    # 5 Check if student has gathered enough to proceed to answering
    updated_session = db.get_session(session_id)
    info_sufficient = _is_info_sufficient(updated_session)

    return {
        "reply": reply,
        "new_evidence": new_evidence,
        "agent_name": agent_name,
        "info_sufficient": info_sufficient,
        "roles_visited": updated_session.get("interviewed_roles") or [],
        "newly_unlocked": result.get("newly_unlocked", False),
        "newly_checked_items": newly_checked,
        "checklist_completed": list(updated_session.get("checklist_completed") or already_completed + newly_checked),
    }
