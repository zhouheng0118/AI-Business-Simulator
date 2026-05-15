from __future__ import annotations

import json as _json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import database as db
from agents.orchestrator import handle_message, handle_message_stream
from agents.scorer import score_answer, get_default_question

router = APIRouter(prefix="/sessions", tags=["sessions"])

_DEFAULT_ALL_ROLES = ["CEO", "CFO", "Operations Director", "Customer Representative", "Local Expert"]


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


@router.post("/{session_id}/messages/stream")
async def send_message_stream(session_id: str, body: SendMessageIn):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Session is '{session['status']}', not accepting messages",
        )

    async def event_generator():
        async for event in handle_message_stream(session_id, body.role_name, body.message):
            yield f"data: {_json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{session_id}/messages")
def get_messages(session_id: str):
    return db.get_messages(session_id)


@router.get("/{session_id}/evidence")
def get_evidence(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    playbook = db.get_playbook_by_case(session["case_id"])
    checklist_items = (playbook.get("checklist_items") or []) if playbook else []
    return {
        "evidence_board": session.get("evidence_board") or [],
        "checklist_items": checklist_items,
        "checklist_completed": session.get("checklist_completed") or [],
    }


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


class SubmitAnswerIn(BaseModel):
    question_id: str
    answer: str
    cited_evidence: list = []


class SubmitSessionIn(BaseModel):
    answers: list[SubmitAnswerIn]


@router.post("/{session_id}/submit")
async def submit_session(session_id: str, body: SubmitSessionIn):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] not in ("answering", "submitted", "scored"):
        raise HTTPException(
            status_code=400,
            detail=f"Session is '{session['status']}', cannot submit yet — proceed first",
        )

    case = db.get_case(session["case_id"])
    playbook = db.get_playbook_by_case(session["case_id"])
    playbook_questions: list = (playbook.get("questions") or []) if playbook else []
    case_type = (case.get("case_type") or "decision") if case else "decision"

    answer_rows = []
    for ans in body.answers:
        q = next((q for q in playbook_questions if q.get("id") == ans.question_id), None)
        answer_rows.append(
            {
                "question_id": ans.question_id,
                "question_type": q["type"] if q else case_type,
                "answer": ans.answer,
                "cited_evidence": ans.cited_evidence,
            }
        )
    db.save_submissions(session_id, answer_rows)

    evidence_board: list = session.get("evidence_board") or []
    case_context = {"case": case, "playbook": playbook}

    question_scores = []
    for ans in body.answers:
        q = next((q for q in playbook_questions if q.get("id") == ans.question_id), None)
        if q is None:
            q = get_default_question(case_type)
        result = await score_answer(q, ans.answer, evidence_board, case_context)
        question_scores.append(result)

    total_score = sum(q["question_total"] for q in question_scores)
    total_max = sum(q["question_max"] for q in question_scores)

    interviewed: list = session.get("interviewed_roles") or []
    all_roles = (
        [r["name"] for r in (playbook.get("roles") or [])] if playbook else _DEFAULT_ALL_ROLES
    ) or _DEFAULT_ALL_ROLES
    missed = [r for r in all_roles if r not in interviewed]

    interview_path = {
        "roles_visited": interviewed,
        "roles_missed": missed,
        "key_info_captured": [e.get("key_info", "") for e in evidence_board[:5]],
        "key_info_missed": [],
    }

    blind_spots = []
    if len(missed) >= 2:
        blind_spots.append(
            {
                "type": "unasked_question",
                "description": f"You skipped {len(missed)} stakeholder(s): {', '.join(missed)}. Their perspectives may have affected your recommendation.",
            }
        )
    if len(evidence_board) < 5:
        blind_spots.append(
            {
                "type": "evidence_bias",
                "description": "Limited evidence was collected. More interviews would have provided a stronger evidentiary basis for your analysis.",
            }
        )

    overall_comment = question_scores[0]["feedback"] if question_scores else ""

    db.save_report(
        session_id,
        question_scores,
        total_score,
        total_max,
        interview_path,
        blind_spots,
        overall_comment,
    )
    db.submit_session(session_id)

    return db.get_report(session_id)


@router.get("/{session_id}/report")
def get_report(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    report = db.get_report(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found — session may not be scored yet")
    return report
