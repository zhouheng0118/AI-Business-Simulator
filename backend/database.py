from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_session(session_id: str) -> dict | None:
    result = (
        _client.table("sessions")
        .select("*")
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_playbook_by_case(case_id: str) -> dict | None:
    result = (
        _client.table("playbooks")
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
        _client.table("messages")
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
        _client.table("messages")
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
        _client.table("sessions")
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


def update_evidence_and_roles(
    session_id: str, new_evidence: list, role_name: str
) -> None:
    session = get_session(session_id)
    board: list = list(session.get("evidence_board") or [])
    roles: list = list(session.get("interviewed_roles") or [])

    board.extend(new_evidence)
    if role_name not in roles:
        roles.append(role_name)

    _client.table("sessions").update(
        {"evidence_board": board, "interviewed_roles": roles}
    ).eq("id", session_id).execute()


def update_session_status(session_id: str, status: str) -> None:
    _client.table("sessions").update({"status": status}).eq(
        "id", session_id
    ).execute()


def get_case(case_id: str) -> dict | None:
    result = (
        _client.table("cases").select("*").eq("id", case_id).limit(1).execute()
    )
    return result.data[0] if result.data else None


def list_cases(published_only: bool = True) -> list:
    query = _client.table("cases").select(
        "id, title, description, case_type, difficulty, status, teaching_goals, created_at"
    )
    if published_only:
        query = query.eq("status", "published")
    return query.order("created_at", desc=True).execute().data
