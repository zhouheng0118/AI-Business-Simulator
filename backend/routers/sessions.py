from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
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


class SubmissionAnswerIn(BaseModel):
    question_id: str
    question_type: str
    answer: str = Field(min_length=1)
    cited_evidence: list[dict] = Field(default_factory=list)
    alternatives_excluded: str | None = None


class SubmitAnswersIn(BaseModel):
    answers: list[SubmissionAnswerIn] = Field(min_length=1)


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


@router.get("/{session_id}/submissions")
def get_submissions(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"submissions": db.get_submissions(session_id)}


@router.post("/{session_id}/submissions")
def submit_answers(session_id: str, body: SubmitAnswersIn):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] not in ("answering", "submitted"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit answers from status '{session['status']}'",
        )

    playbook = db.get_playbook_by_case(session["case_id"])
    if not playbook:
        raise HTTPException(status_code=400, detail="No approved playbook for session")

    question_by_id = {q.get("id"): q for q in playbook.get("questions") or []}
    submitted_ids = {answer.question_id for answer in body.answers}
    required_ids = set(question_by_id)
    missing_ids = required_ids - submitted_ids
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Missing answers for questions: {', '.join(sorted(missing_ids))}",
        )

    normalized_answers = []
    for answer in body.answers:
        question = question_by_id.get(answer.question_id)
        if not question:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown question_id '{answer.question_id}'",
            )
        if answer.question_type != question.get("type"):
            raise HTTPException(
                status_code=400,
                detail=f"Question type mismatch for '{answer.question_id}'",
            )
        normalized_answers.append(answer.model_dump())

    saved = db.submit_answers(session_id, normalized_answers)
    return {"status": "submitted", "submissions": saved}


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
