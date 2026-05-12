"""Submission API contract tests."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app


SESSION = {
    "id": "session-1",
    "case_id": "case-1",
    "student_id": "student-1",
    "status": "answering",
}

PLAYBOOK = {
    "questions": [
        {"id": "q1", "type": "decision", "text": "What should the company do?"},
        {"id": "q2", "type": "analysis", "text": "What is the financial logic?"},
    ]
}


class SubmissionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_submit_answers_requires_all_playbook_questions(self) -> None:
        with (
            patch("routers.sessions.db.get_session", return_value=SESSION),
            patch("routers.sessions.db.get_playbook_by_case", return_value=PLAYBOOK),
        ):
            response = self.client.post(
                "/sessions/session-1/submissions",
                json={
                    "answers": [
                        {
                            "question_id": "q1",
                            "question_type": "decision",
                            "answer": "Stay, but narrow the strategy.",
                            "cited_evidence": [],
                        }
                    ]
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("q2", response.json()["detail"])

    def test_submit_answers_persists_and_marks_session_submitted(self) -> None:
        saved = [
            {
                "session_id": "session-1",
                "question_id": "q1",
                "question_type": "decision",
                "answer": "Stay.",
                "cited_evidence": [],
            },
            {
                "session_id": "session-1",
                "question_id": "q2",
                "question_type": "analysis",
                "answer": "The partnership needs better unit economics.",
                "cited_evidence": [],
            },
        ]

        with (
            patch("routers.sessions.db.get_session", return_value=SESSION),
            patch("routers.sessions.db.get_playbook_by_case", return_value=PLAYBOOK),
            patch("routers.sessions.db.submit_answers", return_value=saved) as submit_answers,
        ):
            response = self.client.post(
                "/sessions/session-1/submissions",
                json={"answers": saved},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "submitted")
        submit_answers.assert_called_once()

    def test_submit_answers_rejects_interview_phase(self) -> None:
        with patch(
            "routers.sessions.db.get_session",
            return_value={**SESSION, "status": "in_progress"},
        ):
            response = self.client.post(
                "/sessions/session-1/submissions",
                json={
                    "answers": [
                        {
                            "question_id": "q1",
                            "question_type": "decision",
                            "answer": "Stay.",
                        }
                    ]
                },
            )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
