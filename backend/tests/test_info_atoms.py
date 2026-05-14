"""Tests for info atom parsing with level field."""

import asyncio
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from agents.playbook_generator import _parse_info_atoms, _generate_info_atoms
from main import app


class InfoAtomParsingTests(unittest.TestCase):

    def test_locked_atom_with_level_is_preserved(self):
        raw = '''[
          {
            "fact": "Actual cash runway is only 4 months",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves or burn rate",
            "level": 1
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(len(atoms), 1)
        self.assertEqual(atoms[0]["level"], 1)

    def test_allowed_atom_has_level_zero(self):
        raw = '''[
          {
            "fact": "Company was founded in 2019 with B2B SaaS focus",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 2
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 0)

    def test_locked_atom_missing_level_defaults_to_one(self):
        raw = '''[
          {
            "fact": "Head-count plan assumes 30 engineers not yet hired",
            "owner_roles": ["Operations Director"],
            "access": "locked",
            "unlock_condition": "Student asks about staffing"
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 1)

    def test_level_out_of_range_is_clamped_to_one(self):
        raw = '''[
          {
            "fact": "Some hidden financial fact",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks",
            "level": 99
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 1)

    def test_allowed_atom_with_wrong_level_is_set_to_zero(self):
        raw = '''[
          {
            "fact": "Company revenue is $5M ARR",
            "owner_roles": ["CFO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 3
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 0)

    def test_fact_too_short_is_rejected(self):
        raw = '''[{"fact": "ok", "owner_roles": ["CEO"], "access": "allowed", "unlock_condition": "", "level": 0}]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms, [])

    def test_allowed_atom_category_is_preserved(self):
        raw = '''[
          {
            "fact": "Company was founded in 2019 with B2B SaaS focus",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0,
            "category": "company_background"
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["category"], "company_background")

    def test_locked_atom_category_is_forced_empty(self):
        raw = '''[
          {
            "fact": "Actual cash runway is only 4 months at current burn rate",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves",
            "level": 1,
            "category": "decision_context"
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["category"], "")

    def test_allowed_atom_missing_category_defaults_to_empty(self):
        raw = '''[
          {
            "fact": "Company revenue is $5M ARR and growing 20 percent",
            "owner_roles": ["CFO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["category"], "")


class InfoAtomGenerationTests(unittest.IsolatedAsyncioTestCase):

    async def test_generate_info_atoms_prompt_contains_category_step(self):
        mock_output = '''[
          {
            "fact": "Company targets SMB segment with 300 existing clients",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0,
            "category": "company_background"
          }
        ]'''
        with patch("agents.playbook_generator.complete", return_value=mock_output) as mock_complete:
            atoms = await _generate_info_atoms(
                raw_content="EcoRide case content here",
                roles=[{"name": "CEO", "allowed_info": ["Targets SMB segment"]}],
                title="EcoRide",
                teaching_goals=["Evaluate market fit"],
            )
        called_prompt = mock_complete.call_args[0][0]
        self.assertIn("company_background", called_prompt)
        self.assertIn("STEP 2b", called_prompt)
        self.assertEqual(atoms[0]["category"], "company_background")

    async def test_generate_info_atoms_returns_list_with_level(self):
        mock_output = '''[
          {
            "fact": "Cash runway is 4 months at current burn",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves",
            "level": 1
          },
          {
            "fact": "Company targets SMB segment with 300 existing clients",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0
          }
        ]'''
        with patch("agents.playbook_generator.complete", return_value=mock_output) as mock_complete:
            atoms = await _generate_info_atoms(
                raw_content="EcoRide case content here",
                roles=[{"name": "CFO", "allowed_info": ["ARPU is $0.60"]}],
                title="EcoRide",
                teaching_goals=["Evaluate unit economics viability"],
            )
        # Verify teaching goal was threaded into the prompt
        called_prompt = mock_complete.call_args[0][0]
        self.assertIn("Evaluate unit economics viability", called_prompt)
        self.assertIsInstance(atoms, list)
        self.assertEqual(len(atoms), 2)
        locked = [a for a in atoms if a["access"] == "locked"]
        self.assertEqual(locked[0]["level"], 1)
        allowed = [a for a in atoms if a["access"] == "allowed"]
        self.assertEqual(allowed[0]["level"], 0)


class InfoAtomEndpointTests(unittest.TestCase):

    def test_patch_info_atoms_calls_db_update(self):
        atoms = [
            {
                "fact": "Cash runway is 4 months",
                "owner_roles": ["CFO"],
                "access": "locked",
                "unlock_condition": "Student asks about cash",
                "level": 1,
                "category": "",
            }
        ]
        with (
            patch("routers.cases.db.get_case", return_value={"id": "case-1"}),
            patch("routers.cases.db.get_playbook", return_value={"id": "pb-1", "case_id": "case-1"}),
            patch("routers.cases.db.update_playbook_info_atoms") as mock_update,
        ):
            client = TestClient(app)
            resp = client.patch(
                "/cases/case-1/playbook/pb-1/info-atoms",
                json={"info_atoms": atoms},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["count"], 1)
        mock_update.assert_called_once_with("pb-1", atoms)

    def test_patch_info_atoms_stores_category(self):
        atoms = [
            {
                "fact": "Company revenue is $5M ARR growing 20 percent year over year",
                "owner_roles": ["CFO"],
                "access": "allowed",
                "unlock_condition": "",
                "level": 0,
                "category": "public_numbers",
            }
        ]
        with (
            patch("routers.cases.db.get_case", return_value={"id": "case-1"}),
            patch("routers.cases.db.get_playbook", return_value={"id": "pb-1", "case_id": "case-1"}),
            patch("routers.cases.db.update_playbook_info_atoms") as mock_update,
        ):
            client = TestClient(app)
            resp = client.patch(
                "/cases/case-1/playbook/pb-1/info-atoms",
                json={"info_atoms": atoms},
            )
        self.assertEqual(resp.status_code, 200)
        saved = mock_update.call_args[0][1]
        self.assertEqual(saved[0]["category"], "public_numbers")

    def test_patch_info_atoms_rejects_invalid_access_value(self):
        atoms = [
            {
                "fact": "Some fact that is long enough to pass validation",
                "owner_roles": ["CFO"],
                "access": "invalid_value",
                "unlock_condition": "",
                "level": 0,
            }
        ]
        with (
            patch("routers.cases.db.get_case", return_value={"id": "case-1"}),
            patch("routers.cases.db.get_playbook", return_value={"id": "pb-1", "case_id": "case-1"}),
            patch("routers.cases.db.update_playbook_info_atoms"),
        ):
            client = TestClient(app)
            resp = client.patch(
                "/cases/case-1/playbook/pb-1/info-atoms",
                json={"info_atoms": atoms},
            )
        self.assertEqual(resp.status_code, 422)


class ComputeAllowedInfoTests(unittest.IsolatedAsyncioTestCase):
    """Tests that _compute_allowed_info uses info_atoms as single source of truth."""

    def _make_role(self, name: str, allowed_info: list[str]) -> dict:
        return {"name": name, "title": "", "role_type": "", "allowed_info": allowed_info}

    def _make_atom(self, fact: str, owner: str, access: str, level: int = 0, unlock: str = "") -> dict:
        return {"fact": fact, "owner_roles": [owner], "access": access,
                "unlock_condition": unlock, "level": level, "category": ""}

    async def test_info_atoms_basic_layer_overrides_role_allowed_info(self):
        """When info_atoms is non-empty, agents use the basic layer atoms, not role.allowed_info."""
        from agents.orchestrator import _compute_allowed_info

        role = self._make_role("CFO", ["old fact from first pass"])
        info_atoms = [
            self._make_atom("Reviewed basic fact from professor edit", "CFO", "allowed"),
        ]
        allowed, had_unlock = await _compute_allowed_info(role, info_atoms, {}, [], "hi")
        self.assertEqual(allowed, ["Reviewed basic fact from professor edit"])
        self.assertNotIn("old fact from first pass", allowed)

    async def test_falls_back_to_role_allowed_info_when_no_info_atoms(self):
        """Legacy playbooks with no info_atoms still use role.allowed_info."""
        from agents.orchestrator import _compute_allowed_info

        role = self._make_role("CEO", ["legacy fact"])
        allowed, had_unlock = await _compute_allowed_info(role, [], {}, [], "hi")
        self.assertEqual(allowed, ["legacy fact"])

    async def test_only_owned_basic_atoms_are_included(self):
        """Basic atoms belonging to other roles are excluded."""
        from agents.orchestrator import _compute_allowed_info

        role = self._make_role("CEO", ["should not appear"])
        info_atoms = [
            self._make_atom("CEO fact", "CEO", "allowed"),
            self._make_atom("CFO fact", "CFO", "allowed"),
        ]
        allowed, _ = await _compute_allowed_info(role, info_atoms, {}, [], "hi")
        self.assertIn("CEO fact", allowed)
        self.assertNotIn("CFO fact", allowed)

    async def test_unlocked_locked_atom_appended_to_basic_layer(self):
        """A locked atom whose condition is met gets appended after the basic layer."""
        from agents.orchestrator import _compute_allowed_info

        role = self._make_role("CFO", ["stale first-pass fact"])
        info_atoms = [
            self._make_atom("Public CFO fact", "CFO", "allowed"),
            self._make_atom("Hidden runway fact", "CFO", "locked", level=1,
                            unlock="Student asks about cash runway"),
        ]
        with patch("agents.orchestrator._is_unlock_condition_met", return_value=True):
            allowed, had_unlock = await _compute_allowed_info(role, info_atoms, {}, [], "what is your runway?")
        self.assertIn("Public CFO fact", allowed)
        self.assertIn("Hidden runway fact", allowed)
        self.assertNotIn("stale first-pass fact", allowed)
        self.assertTrue(had_unlock)

    async def test_locked_atom_not_included_when_condition_unmet(self):
        """A locked atom whose condition is not met stays hidden."""
        from agents.orchestrator import _compute_allowed_info

        role = self._make_role("CFO", [])
        info_atoms = [
            self._make_atom("Public CFO fact", "CFO", "allowed"),
            self._make_atom("Hidden runway fact", "CFO", "locked", level=1,
                            unlock="Student asks about cash runway"),
        ]
        with patch("agents.orchestrator._is_unlock_condition_met", return_value=False):
            allowed, had_unlock = await _compute_allowed_info(role, info_atoms, {}, [], "tell me about growth")
        self.assertEqual(allowed, ["Public CFO fact"])
        self.assertFalse(had_unlock)


if __name__ == "__main__":
    unittest.main()
