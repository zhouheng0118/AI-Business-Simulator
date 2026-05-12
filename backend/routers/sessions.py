from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import database as db
from agents.orchestrator import handle_message

router = APIRouter(prefix="/sessions", tags=["sessions"])


# Must be declared before /{session_id} to avoid route shadowing
@router.get("/by-student/{student_id}")
def get_sessions_by_student(student_id: str):
    return db.get_sessions_by_student(student_id)


class CreateSessionIn(BaseModel):
    case_id: str
    student_id: str


class SendMessageIn(BaseModel):
    role_name: str
    message: str


@router.post("")
def create_session(body: CreateSessionIn):
    return db.create_session(body.case_id, body.student_id)


@router.get("/{session_id}")
def get_session(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/messages")
async def send_message(session_id: str, body: SendMessageIn):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Session is '{session['status']}', not accepting messages",
        )
    return await handle_message(session_id, body.role_name, body.message)


@router.get("/{session_id}/messages")
def get_messages(session_id: str):
    return db.get_messages(session_id)


@router.get("/{session_id}/evidence")
def get_evidence(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"evidence_board": session.get("evidence_board") or []}


@router.post("/{session_id}/proceed")
def proceed_to_answering(session_id: str):
    """Student clicks 'Proceed to answering' after info_sufficient is True."""
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot proceed from status '{session['status']}'",
        )
    db.update_session_status(session_id, "answering")
    return {"status": "answering"}
