from fastapi import APIRouter
import database as db

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/by-student/{student_id}")
def get_assignments_by_student(student_id: str):
    return db.get_assignments_by_student(student_id)
