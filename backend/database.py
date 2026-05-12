from typing import Any
import re

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Any | None = None
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "our",
    "per",
    "that",
    "the",
    "this",
    "to",
    "with",
}
_HIGH_SIGNAL_TERMS = {
    "arpu",
    "attrition",
    "breakeven",
    "break-even",
    "burn",
    "capex",
    "cash",
    "charging",
    "compliance",
    "cost",
    "costs",
    "fleet",
    "license",
    "licensing",
    "margin",
    "margins",
    "operator",
    "operators",
    "regulation",
    "regulatory",
    "revenue",
    "runway",
    "tender",
    "vandalism",
}
_CONCEPT_TERMS = {
    "liquidity": {
        "burn",
        "capital",
        "cash",
        "funding",
        "liquidity",
        "reserves",
        "runway",
        "war",
    },
    "revenue": {"arpu", "revenue", "ride", "rides", "unit"},
    "regulatory_access": {
        "compliance",
        "license",
        "licenses",
        "operator",
        "operators",
        "regulation",
        "regulatory",
        "tender",
    },
    "fleet_attrition": {"attrition", "fleet", "theft", "vandalism"},
    "operations": {"charging", "maintenance", "rebalancing", "staffing"},
}


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


def _evidence_numbers(item: dict) -> set[str]:
    text = " ".join(
        str(item.get(field, ""))
        for field in ("key_info", "data", "risk")
    ).lower()
    return set(re.findall(r"\$?\d+(?:\.\d+)?%?|\d+(?:\.\d+)?m", text))


def _evidence_terms(item: dict) -> set[str]:
    text = " ".join(
        str(item.get(field, ""))
        for field in ("key_info", "risk")
    ).lower()
    words = re.findall(r"[a-z][a-z0-9-]{2,}", text)
    return {word for word in words if word not in _STOPWORDS}


def _is_semantic_duplicate(existing: dict, candidate: dict) -> bool:
    """Return whether two evidence items are near-duplicates for one source."""
    if _evidence_key(existing)[0] != _evidence_key(candidate)[0]:
        return False

    existing_numbers = _evidence_numbers(existing)
    candidate_numbers = _evidence_numbers(candidate)
    if existing_numbers and candidate_numbers and not (existing_numbers & candidate_numbers):
        return False

    existing_terms = _evidence_terms(existing)
    candidate_terms = _evidence_terms(candidate)
    if not existing_terms or not candidate_terms:
        return False

    overlap = existing_terms & candidate_terms
    if (
        existing_numbers
        and candidate_numbers
        and existing_numbers & candidate_numbers
        and _evidence_concepts(existing_terms) & _evidence_concepts(candidate_terms)
    ):
        return True

    if (
        existing_numbers
        and candidate_numbers
        and existing_numbers == candidate_numbers
        and overlap & _HIGH_SIGNAL_TERMS
    ):
        return True

    smaller_size = min(len(existing_terms), len(candidate_terms))
    return len(overlap) / smaller_size >= 0.55


def _evidence_concepts(terms: set[str]) -> set[str]:
    """Map evidence terms into coarse business concepts."""
    concepts = set()
    for concept, concept_terms in _CONCEPT_TERMS.items():
        if terms & concept_terms:
            concepts.add(concept)
    return concepts


def _append_unique_evidence(board: list, new_evidence: list) -> list:
    """Append evidence while removing exact and near-duplicate items."""
    result = [item for item in board if isinstance(item, dict)]
    seen = {_evidence_key(item) for item in result}

    for item in new_evidence:
        if not isinstance(item, dict):
            continue
        key = _evidence_key(item)
        if key in seen or not all(key):
            continue
        if any(_is_semantic_duplicate(existing, item) for existing in result):
            continue
        seen.add(key)
        result.append(item)

    return result


def update_evidence_and_roles(
    session_id: str, new_evidence: list, role_name: str
) -> None:
    session = get_session(session_id)
    board: list = list(session.get("evidence_board") or [])
    roles: list = list(session.get("interviewed_roles") or [])

    board = _append_unique_evidence(board, new_evidence)

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


def get_sessions_by_student(student_id: str) -> list:
    return (
        _get_client().table("sessions")
        .select("id, case_id, status, interviewed_roles, started_at, submitted_at")
        .eq("student_id", student_id)
        .order("started_at", desc=True)
        .execute()
        .data
    )


def get_assignments_by_student(student_id: str) -> list:
    return (
        _get_client().table("case_assignments")
        .select("case_id, due_at")
        .eq("student_id", student_id)
        .execute()
        .data
    )


def get_case_stats(case_id: str) -> dict:
    sessions = (
        _get_client().table("sessions")
        .select("id, status")
        .eq("case_id", case_id)
        .execute()
        .data
    )
    submitted_ids = [
        s["id"] for s in sessions if s["status"] in ("submitted", "scored")
    ]

    avg_score = None
    if submitted_ids:
        reports = (
            _get_client().table("reports")
            .select("total_score")
            .in_("session_id", submitted_ids)
            .execute()
            .data
        )
        scores = [
            float(r["total_score"])
            for r in reports
            if r.get("total_score") is not None
        ]
        if scores:
            avg_score = round(sum(scores) / len(scores), 1)

    return {
        "sessions_total": len(sessions),
        "sessions_submitted": len(submitted_ids),
        "avg_score": avg_score,
    }
