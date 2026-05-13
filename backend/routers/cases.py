import io
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
import database as db
from agents.playbook_generator import generate_playbook

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("/parse-file")
async def parse_file(file: UploadFile = File(...)):
    """Extract plain text from an uploaded .txt, .md, or .pdf file."""
    filename = file.filename or ""
    content_bytes = await file.read()

    if filename.endswith((".txt", ".md")):
        try:
            text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = content_bytes.decode("latin-1", errors="replace")
        return {"text": text, "file_type": "markdown" if filename.endswith(".md") else "text"}

    if filename.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content_bytes))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n\n".join(p.strip() for p in pages if p.strip())
            if not text:
                raise HTTPException(status_code=422, detail="PDF has no extractable text (may be scanned/image-based).")
            return {"text": text, "file_type": "pdf"}
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF parsing library not available on server.")

    raise HTTPException(status_code=415, detail="Unsupported file type. Upload a .txt, .md, or .pdf file.")


@router.get("")
def list_cases(published_only: bool = True):
    return db.list_cases(published_only=published_only)


@router.get("/{case_id}/stats")
def get_case_stats(case_id: str):
    case = db.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return db.get_case_stats(case_id)


@router.get("/{case_id}")
def get_case(case_id: str):
    case = db.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    playbook = db.get_playbook_by_case(case_id)
    return {"case": case, "playbook": playbook}


# Professor: case creation

class CreateCaseIn(BaseModel):
    title: str = Field(min_length=3)
    description: str = ""
    raw_content: str = Field(min_length=20)
    case_type: str = "decision"
    difficulty: str = "medium"
    teaching_goals: list[str] = []


@router.post("")
async def create_case_and_generate(body: CreateCaseIn):
    """Create a case and immediately generate its playbook via LLM."""
    if body.case_type not in ("decision", "analysis", "reflection"):
        raise HTTPException(status_code=422, detail="case_type must be decision, analysis, or reflection")
    if body.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=422, detail="difficulty must be easy, medium, or hard")

    case = db.create_case(
        title=body.title,
        description=body.description,
        raw_content=body.raw_content,
        case_type=body.case_type,
        difficulty=body.difficulty,
        teaching_goals=body.teaching_goals,
    )

    playbook_data = await generate_playbook(
        raw_content=body.raw_content,
        case_type=body.case_type,
        teaching_goals=body.teaching_goals,
        title=body.title,
    )

    playbook = db.create_playbook(
        case_id=case["id"],
        roles=playbook_data["roles"],
        questions=playbook_data["questions"],
        info_atoms=playbook_data.get("info_atoms") or [],
    )

    return {"case": case, "playbook": playbook}


# Professor: playbook review

class ApprovePlaybookIn(BaseModel):
    publish: bool = True


@router.post("/{case_id}/playbook/{playbook_id}/approve")
def approve_playbook(case_id: str, playbook_id: str, body: ApprovePlaybookIn = ApprovePlaybookIn()):
    case = db.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    playbook = db.get_playbook(playbook_id)
    if not playbook or playbook["case_id"] != case_id:
        raise HTTPException(status_code=404, detail="Playbook not found")

    db.approve_playbook(playbook_id)
    if body.publish:
        db.publish_case(case_id)

    return {"status": "approved", "case_status": "published" if body.publish else case["status"]}


class RejectPlaybookIn(BaseModel):
    notes: str = ""


@router.post("/{case_id}/playbook/{playbook_id}/reject")
def reject_playbook(case_id: str, playbook_id: str, body: RejectPlaybookIn = RejectPlaybookIn()):
    case = db.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    playbook = db.get_playbook(playbook_id)
    if not playbook or playbook["case_id"] != case_id:
        raise HTTPException(status_code=404, detail="Playbook not found")

    db.reject_playbook(playbook_id, body.notes)
    return {"status": "rejected"}


@router.get("/{case_id}/playbook/pending")
def get_pending_playbook(case_id: str):
    case = db.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    playbook = db.get_pending_playbook(case_id)
    if not playbook:
        raise HTTPException(status_code=404, detail="No playbook found for this case")
    return {"case": case, "playbook": playbook}
