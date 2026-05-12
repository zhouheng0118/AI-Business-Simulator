from fastapi import APIRouter, HTTPException
import database as db

router = APIRouter(prefix="/cases", tags=["cases"])


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
