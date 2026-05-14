"""Tests for main-agent playbook generation."""

from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from agents.playbook_generator import _parse_playbook
from main import app


class PlaybookGeneratorTests(unittest.TestCase):
    def test_parse_playbook_returns_complete_simulation_contract(self) -> None:
        raw = json.dumps(
            {
                "roles": [
                    {
                        "name": "CEO",
                        "title": "Chief Executive Officer",
                        "role_type": "strategy",
                        "persona": "Growth-oriented.",
                        "focus_area": "Strategic tradeoffs",
                        "allowed_info": ["Paris has 100k daily micro-mobility trips."],
                        "locked_info": ["Failure in Paris may hurt the next round."],
                        "unlock_conditions": "Student asks about investor downside.",
                    },
                    {
                        "name": "CFO",
                        "title": "Chief Financial Officer",
                        "role_type": "finance",
                        "persona": "Risk-focused.",
                        "focus_area": "Unit economics",
                        "allowed_info": ["Average revenue per ride is $3.50."],
                        "locked_info": ["Labor rules could raise operating costs by 30%."],
                        "unlock_conditions": "Student asks about labor costs.",
                    },
                ],
                "info_atoms": [
                    {
                        "fact": "Average revenue per ride is $3.50.",
                        "owner_roles": ["CFO"],
                        "access": "allowed",
                    },
                    {
                        "fact": "Labor rules could raise operating costs by 30%.",
                        "owner_roles": ["finance"],
                        "access": "locked",
                        "unlock_condition": "Student asks about labor costs.",
                    },
                ],
                "questions": [
                    {
                        "id": "q1",
                        "type": "decision",
                        "text": "Should EcoRide bid for the Paris tender?",
                        "rubric_dimensions": [
                            {"name": "Evidence Use", "weight": 25},
                            {"name": "Risk Awareness", "weight": 25},
                        ],
                    }
                ],
            }
        )

        playbook = _parse_playbook(raw)

        self.assertEqual(len(playbook["roles"]), 5)
        self.assertEqual(
            [role["role_type"] for role in playbook["roles"]],
            [
                "strategy",
                "finance",
                "operations",
                "customer_market",
                "local_regulatory",
            ],
        )
        cfo = next(role for role in playbook["roles"] if role["role_type"] == "finance")
        self.assertEqual(cfo["locked_info"], ["Labor rules could raise operating costs by 30%."])
        self.assertEqual(cfo["unlock_conditions"], "Student asks about labor costs.")
        self.assertTrue(any(atom["access"] == "locked" for atom in playbook["info_atoms"]))
        self.assertTrue(any("finance" in atom["owner_roles"] for atom in playbook["info_atoms"]))

    def test_parse_playbook_fallback_still_has_full_shape(self) -> None:
        playbook = _parse_playbook("not json")

        self.assertEqual(len(playbook["roles"]), 5)
        self.assertIn("info_atoms", playbook)
        self.assertEqual(len(playbook["questions"]), 1)
        for role in playbook["roles"]:
            self.assertIn("locked_info", role)
            self.assertIn("unlock_conditions", role)


class CreateCasePlaybookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_create_case_persists_generated_info_atoms(self) -> None:
        generated = {
            "roles": [
                {
                    "name": "CEO",
                    "title": "Chief Executive Officer",
                    "role_type": "strategy",
                    "persona": "Growth-oriented.",
                    "focus_area": "Strategy",
                    "allowed_info": ["Fact"],
                    "locked_info": ["Hidden fact"],
                    "unlock_conditions": "Ask about risk.",
                }
            ],
            "info_atoms": [
                {
                    "fact": "Hidden fact",
                    "owner_roles": ["CEO", "strategy"],
                    "access": "locked",
                    "unlock_condition": "Ask about risk.",
                }
            ],
            "questions": [
                {
                    "id": "q1",
                    "type": "decision",
                    "text": "What should the company do?",
                    "rubric_dimensions": [{"name": "Evidence Use", "weight": 25}],
                }
            ],
        }
        case = {
            "id": "case-1",
            "title": "Demo",
            "description": "Demo",
            "case_type": "decision",
            "difficulty": "medium",
            "status": "draft",
            "teaching_goals": [],
            "created_at": "2026-01-01T00:00:00Z",
        }
        playbook = {
            "id": "playbook-1",
            "case_id": "case-1",
            "version": 1,
            "roles": generated["roles"],
            "info_atoms": generated["info_atoms"],
            "questions": generated["questions"],
            "review_status": "pending",
        }

        with (
            patch("routers.cases.db.create_case", return_value=case),
            patch("routers.cases.generate_playbook", new=AsyncMock(return_value=generated)),
            patch("routers.cases.db.create_playbook", return_value=playbook) as create_playbook,
        ):
            response = self.client.post(
                "/cases",
                json={
                    "title": "Demo",
                    "description": "Demo",
                    "raw_content": "This is a sufficiently long demo case about a company decision.",
                    "case_type": "decision",
                    "difficulty": "medium",
                    "teaching_goals": [],
                },
            )

        self.assertEqual(response.status_code, 200)
        create_playbook.assert_called_once()
        self.assertEqual(
            create_playbook.call_args.kwargs["info_atoms"],
            generated["info_atoms"],
        )


if __name__ == "__main__":
    unittest.main()
