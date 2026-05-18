"""Developer-only routes — only mounted when DEV_MODE=true.

These endpoints exist purely to support local testing and should never be
exposed in production.  The main.py guard (DEV_MODE check) is the single
switch that hides this entire module.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
import database as db
from agents.missions import DEFAULT_MISSION_STATE

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/cases")
def list_all_cases():
    """Return cases that have an approved playbook, including question IDs for e2e testing."""
    all_cases = db.list_cases(published_only=False)
    result = []
    for case in all_cases:
        playbook = db.get_playbook_by_case(case["id"])
        if playbook:
            questions = [
                {"id": q.get("id"), "type": q.get("type", "decision")}
                for q in (playbook.get("questions") or [])
                if q.get("id")
            ]
            result.append({
                **case,
                "playbook_id": playbook["id"],
                "questions": questions,
            })
    return result


@router.post("/sessions/{session_id}/reset")
def reset_session(session_id: str):
    """Reset a session back to its initial state for re-running e2e tests."""
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    client = db._get_client()
    client.table("messages").delete().eq("session_id", session_id).execute()
    client.table("submissions").delete().eq("session_id", session_id).execute()
    client.table("reports").delete().eq("session_id", session_id).execute()
    client.table("sessions").update({
        "status": "in_progress",
        "evidence_board": [],
        "interviewed_roles": [],
        "checklist_completed": [],
        "mission_state": DEFAULT_MISSION_STATE,
        "submitted_at": None,
    }).eq("id", session_id).execute()

    return {"status": "reset", "session_id": session_id}
