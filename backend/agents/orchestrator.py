import json
import re
import database as db
from agents.sub_agents import call_sub_agent
from llm_client import FALLBACK_REPLY, complete

_MIN_ROLES = 3
_MIN_EVIDENCE = 3
ROLE_ALIASES = {
    "CEO": {"CEO"},
    "CFO": {"CFO", "Chief Financial Officer"},
    "Head of Operations": {"Head of Operations", "Operations Manager", "运营负责人"},
    "Customer Rep": {"Customer Rep", "Customer Representative", "客户代表"},
    "Local Expert": {"Local Expert", "Market Consultant", "本地专家"},
}


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
) -> list:
    """Compute facts this role is allowed to reveal in the current turn."""
    allowed = list(role.get("allowed_info", []))

    # Check each locked atom owned by this role for unlock
    locked_atoms = [
        a
        for a in info_atoms
        if role["name"] in a.get("owner_roles", []) and a.get("access") == "locked"
    ]
    for atom in locked_atoms:
        condition = atom.get("unlock_condition", "")
        if condition and await _is_unlock_condition_met(
            condition, session, history, current_message
        ):
            allowed.append(atom["fact"])

    return allowed


# Step 3 (post): Extract evidence from reply

async def _extract_evidence(reply: str, role_name: str) -> list:
    """Extract decision-relevant evidence items from an agent reply."""
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
    return _parse_evidence(raw, role_name)


def _parse_evidence(raw: str, role_name: str) -> list:
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


def _coerce_evidence_list(value: object) -> list:
    """Support both the current list contract and older single-item callers."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [value]
    return []


# Step 4: Sufficiency check

def _is_info_sufficient(session: dict) -> bool:
    """Return whether the session has enough interviews and evidence."""
    roles_visited = len(session.get("interviewed_roles") or [])
    evidence_count = len(session.get("evidence_board") or [])
    return roles_visited >= _MIN_ROLES and evidence_count >= _MIN_EVIDENCE


def _canonical_role_label(label: str) -> str:
    """Normalize a user-facing role label to the canonical role name."""
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
    ]
    return target.lower() in {candidate.lower() for candidate in candidates if candidate}


def _find_role(roles: list, target_role: str) -> dict | None:
    """Find a role config in the playbook using English or Chinese labels."""
    return next((role for role in roles if _role_matches(role, target_role)), None)


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

    role = _find_role(roles, target_role)
    if role is None:
        return {
            "reply": FALLBACK_REPLY,
            "evidence": [],
            "agent_name": target_role,
            "role_found": False,
        }

    allowed_info = await _compute_allowed_info(
        role, info_atoms, session, history, user_message
    )
    reply = await call_sub_agent(role, allowed_info, history, user_message)
    evidence_items = await _extract_evidence(reply, role["name"])

    return {
        "reply": reply,
        "evidence": evidence_items,
        "agent_name": role["name"],
        "role_found": True,
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

    result = await handle_student_message(
        target_role=role_name,
        user_message=student_message,
        history=history,
        case_context={
            "case_id": session["case_id"],
            "playbook": playbook,
            "session": session,
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

    # 4 Check if student has gathered enough to proceed to answering
    updated_session = db.get_session(session_id)
    info_sufficient = _is_info_sufficient(updated_session)

    return {
        "reply": reply,
        "new_evidence": new_evidence,
        "agent_name": agent_name,
        "info_sufficient": info_sufficient,
        "roles_visited": updated_session.get("interviewed_roles") or [],
    }
