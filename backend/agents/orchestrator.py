import json
from config import llm_client, MODEL_NAME
import database as db
from agents.sub_agents import call_sub_agent

_MIN_ROLES = 3
_MIN_EVIDENCE = 3


async def _llm(prompt: str, max_tokens: int = 10) -> str:
    response = await llm_client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.0,
    )
    return (response.choices[0].message.content or "").strip()


# Step 1: Intent / unlock evaluation 

async def _is_unlock_condition_met(
    condition: str, session: dict, history: list, current_message: str
) -> bool:
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
    try:
        items = json.loads(raw)
        if not isinstance(items, list):
            return []
        return [
            {"source": role_name, **item}
            for item in items
            if isinstance(item, dict)
        ]
    except Exception:
        return []


# Step 4: Sufficiency check

def _is_info_sufficient(session: dict) -> bool:
    roles_visited = len(session.get("interviewed_roles") or [])
    evidence_count = len(session.get("evidence_board") or [])
    return roles_visited >= _MIN_ROLES and evidence_count >= _MIN_EVIDENCE


# Main entry point

async def handle_message(
    session_id: str, role_name: str, student_message: str
) -> dict:
    # Load state from Supabase (no in-memory session state)
    session = db.get_session(session_id)
    playbook = db.get_playbook_by_case(session["case_id"])

    roles: list = playbook["roles"]
    info_atoms: list = playbook.get("info_atoms") or []

    role = next((r for r in roles if r["name"] == role_name), None)
    if role is None:
        raise ValueError(f"Unknown role: {role_name!r}")

    history = db.get_messages(session_id)

    # 1 + 2 Determine what this role may reveal this turn
    allowed_info = await _compute_allowed_info(
        role, info_atoms, session, history, student_message
    )

    # 3 Route to Sub-Agent with controlled system prompt
    reply = await call_sub_agent(role, allowed_info, history, student_message)

    # 3 Extract evidence and persist
    new_evidence = await _extract_evidence(reply, role_name)
    db.save_message(session_id, "student", student_message, role_name)
    db.save_message(session_id, "agent", reply, role_name)
    db.update_evidence_and_roles(session_id, new_evidence, role_name)

    # 4 Check if student has gathered enough to proceed to answering
    updated_session = db.get_session(session_id)
    info_sufficient = _is_info_sufficient(updated_session)

    return {
        "reply": reply,
        "new_evidence": new_evidence,
        "info_sufficient": info_sufficient,
        "roles_visited": updated_session.get("interviewed_roles") or [],
    }
