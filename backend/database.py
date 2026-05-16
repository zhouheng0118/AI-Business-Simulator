from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import re

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from text_utils import STOPWORDS as _STOPWORDS, word_overlap_ratio

_client: Any | None = None
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
                "checklist_completed": [],
            }
        )
        .execute()
        .data[0]
    )


def update_checklist_completed(session_id: str, completed_indices: list[int]) -> None:
    _get_client().table("sessions").update(
        {"checklist_completed": completed_indices}
    ).eq("id", session_id).execute()


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

    return word_overlap_ratio(existing_terms, candidate_terms) >= 0.55


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


def add_interviewed_role(session_id: str, role_name: str) -> None:
    """Append role_name to interviewed_roles without touching evidence_board."""
    session = get_session(session_id)
    roles: list = list(session.get("interviewed_roles") or [])
    if role_name not in roles:
        roles.append(role_name)
        _get_client().table("sessions").update(
            {"interviewed_roles": roles}
        ).eq("id", session_id).execute()


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


def get_submissions(session_id: str) -> list:
    return (
        _get_client().table("submissions")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
        .data
    )


def submit_answers(session_id: str, answers: list[dict]) -> list:
    rows = [
        {
            "session_id": session_id,
            "question_id": answer["question_id"],
            "question_type": answer["question_type"],
            "answer": answer["answer"],
            "cited_evidence": answer.get("cited_evidence") or [],
            "alternatives_excluded": answer.get("alternatives_excluded"),
        }
        for answer in answers
    ]

    saved = (
        _get_client().table("submissions")
        .upsert(rows, on_conflict="session_id,question_id")
        .execute()
        .data
    )

    _get_client().table("sessions").update(
        {
            "status": "submitted",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", session_id).execute()

    return saved


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


def save_submissions(session_id: str, answers: list[dict]) -> None:
    """Save student answers — delete previous rows then insert fresh."""
    _get_client().table("submissions").delete().eq("session_id", session_id).execute()
    for ans in answers:
        _get_client().table("submissions").insert(
            {
                "session_id": session_id,
                "question_id": ans["question_id"],
                "question_type": ans.get("question_type", "decision"),
                "answer": ans["answer"],
                "cited_evidence": ans.get("cited_evidence", []),
            }
        ).execute()


def save_report(
    session_id: str,
    scores: list,
    total_score: float,
    total_max: float,
    interview_path: dict,
    blind_spots: list,
    overall_comment: str,
) -> dict:
    _get_client().table("reports").delete().eq("session_id", session_id).execute()
    result = (
        _get_client().table("reports")
        .insert(
            {
                "session_id": session_id,
                "scores": scores,
                "total_score": total_score,
                "total_max": total_max,
                "interview_path": interview_path,
                "blind_spots": blind_spots,
                "overall_comment": overall_comment,
            }
        )
        .execute()
    )
    return result.data[0] if result.data else {}


def get_report(session_id: str) -> dict | None:
    result = (
        _get_client().table("reports")
        .select("*")
        .eq("session_id", session_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def submit_session(session_id: str) -> None:
    from datetime import datetime, timezone

    _get_client().table("sessions").update(
        {
            "status": "scored",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", session_id).execute()


def create_case(
    title: str,
    description: str,
    raw_content: str,
    case_type: str,
    difficulty: str,
    teaching_goals: list[str],
) -> dict:
    result = (
        _get_client().table("cases")
        .insert(
            {
                "title": title,
                "description": description,
                "raw_content": raw_content,
                "case_type": case_type,
                "difficulty": difficulty,
                "teaching_goals": teaching_goals,
                "status": "draft",
            }
        )
        .execute()
    )
    return result.data[0]


def create_playbook(case_id: str, roles: list, questions: list, info_atoms: list | None = None, checklist_items: list | None = None) -> dict:
    result = (
        _get_client().table("playbooks")
        .insert(
            {
                "case_id": case_id,
                "version": 1,
                "roles": roles,
                "questions": questions,
                "info_atoms": info_atoms or [],
                "checklist_items": checklist_items or [],
                "review_status": "pending",
            }
        )
        .execute()
    )
    return result.data[0]


def get_playbook(playbook_id: str) -> dict | None:
    result = (
        _get_client().table("playbooks")
        .select("*")
        .eq("id", playbook_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_pending_playbook(case_id: str) -> dict | None:
    result = (
        _get_client().table("playbooks")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def approve_playbook(playbook_id: str) -> None:
    _get_client().table("playbooks").update(
        {
            "review_status": "approved",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", playbook_id).execute()


def reject_playbook(playbook_id: str, notes: str = "") -> None:
    _get_client().table("playbooks").update(
        {
            "review_status": "rejected",
            "review_notes": notes,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", playbook_id).execute()


def publish_case(case_id: str) -> None:
    _get_client().table("cases").update({"status": "published"}).eq("id", case_id).execute()


def update_case_description(case_id: str, description: str) -> None:
    _get_client().table("cases").update({"description": description}).eq("id", case_id).execute()


def update_case(case_id: str, fields: dict) -> dict:
    result = (
        _get_client().table("cases")
        .update(fields)
        .eq("id", case_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def delete_case(case_id: str) -> None:
    client = _get_client()
    # Delete child records first to avoid FK constraint violations
    client.table("playbooks").delete().eq("case_id", case_id).execute()
    client.table("case_assignments").delete().eq("case_id", case_id).execute()
    sessions = client.table("sessions").select("id").eq("case_id", case_id).execute().data
    for s in sessions:
        sid = s["id"]
        client.table("messages").delete().eq("session_id", sid).execute()
        client.table("submissions").delete().eq("session_id", sid).execute()
        client.table("reports").delete().eq("session_id", sid).execute()
    client.table("sessions").delete().eq("case_id", case_id).execute()
    client.table("cases").delete().eq("id", case_id).execute()


def update_playbook_info_atoms(playbook_id: str, info_atoms: list) -> None:
    result = (
        _get_client().table("playbooks").update(
            {"info_atoms": info_atoms}
        ).eq("id", playbook_id).execute()
    )
    if not result.data:
        raise RuntimeError(f"Playbook {playbook_id} not found during info_atoms update")


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
