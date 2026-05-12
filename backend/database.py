from typing import Any
import re

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Any | None = None


def _get_client() -> Any:
    """Return a Supabase client, creating it only when DB access is needed."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured for database access."
            )
        from supabase import create_client

        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def get_session(session_id: str) -> dict | None:
    result = (
        _get_client().table("sessions")
        .select("*")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_playbook_by_case(case_id: str) -> dict | None:
    result = (
        _get_client().table("playbooks")
        .select("*")
        .eq("case_id", case_id)
        .eq("review_status", "approved")
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_messages(session_id: str) -> list:
    return (
        _get_client().table("messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
        .data
    )


def save_message(
    session_id: str, role: str, content: str, agent_name: str | None = None
) -> dict:
    return (
        _get_client().table("messages")
        .insert(
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "agent_name": agent_name,
            }
        )
        .execute()
        .data[0]
    )


def create_session(case_id: str, student_id: str) -> dict:
    return (
        _get_client().table("sessions")
        .insert(
            {
                "case_id": case_id,
                "student_id": student_id,
                "status": "in_progress",
                "evidence_board": [],
                "interviewed_roles": [],
            }
        )
        .execute()
        .data[0]
    )


def _evidence_key(item: dict) -> tuple[str, str]:
    source = str(item.get("source", "")).strip().lower()
    key_info = re.sub(r"\s+", " ", str(item.get("key_info", "")).strip()).lower()
    return source, key_info


def update_evidence_and_roles(
    session_id: str, new_evidence: list, role_name: str
) -> None:
    session = get_session(session_id)
    board: list = list(session.get("evidence_board") or [])
    roles: list = list(session.get("interviewed_roles") or [])

    seen = {_evidence_key(item) for item in board if isinstance(item, dict)}
    for item in new_evidence:
        if not isinstance(item, dict):
            continue
        key = _evidence_key(item)
        if key in seen or not all(key):
            continue
        seen.add(key)
        board.append(item)

    if role_name not in roles:
        roles.append(role_name)

    _get_client().table("sessions").update(
        {"evidence_board": board, "interviewed_roles": roles}
    ).eq("id", session_id).execute()


def update_session_status(session_id: str, status: str) -> None:
    _get_client().table("sessions").update({"status": status}).eq(
        "id", session_id
    ).execute()


def get_case(case_id: str) -> dict | None:
    result = (
        _get_client().table("cases").select("*").eq("id", case_id).limit(1).execute()
    )
    return result.data[0] if result.data else None


def list_cases(published_only: bool = True) -> list:
    query = _get_client().table("cases").select(
        "id, title, description, case_type, difficulty, status, teaching_goals, created_at"
    )
    if published_only:
        query = query.eq("status", "published")
    return query.order("created_at", desc=True).execute().data
