"""Basic Agent contract tests."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from agents.orchestrator import (
    _extract_evidence,
    _fallback_extract_evidence,
    _parse_evidence,
    handle_student_message,
)
from llm_client import chat


CASE_CONTEXT = {
    "case_id": "case-1",
    "session": {"interviewed_roles": []},
    "playbook": {
        "roles": [
            {
                "name": "CFO",
                "title": "Chief Financial Officer",
                "persona": "Cautious and data-driven",
                "focus_area": "Cash flow and financial risk",
                "allowed_info": ["ARPU in India is $0.60 vs $5.20 globally"],
                "locked_info": ["Current India operation loses $18M annually"],
                "unlock_conditions": "Student asks specifically about loss figures",
            }
        ],
        "info_atoms": [
            {
                "fact": "Current India operation loses $18M annually",
                "owner_roles": ["CFO"],
                "access": "locked",
                "unlock_condition": "Student asks specifically about loss figures",
            }
        ],
    },
}


class LLMClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_llm_client_returns_string(self) -> None:
        """The centralized client should return text even without an API key."""
        with patch("llm_client.MODEL_API_KEY", None):
            result = await chat("You are the CFO.", "hello")
        self.assertIsInstance(result, str)
        self.assertTrue(result)


class AgentContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_handle_student_message_returns_contract(self) -> None:
        """The pure Agent entry point should return the agreed contract keys."""
        with (
            patch(
                "agents.orchestrator.call_sub_agent",
                return_value="From a finance perspective, ARPU is the key issue.",
            ),
            patch(
                "agents.orchestrator._extract_evidence",
                return_value=[
                    {
                        "source": "CFO",
                        "key_info": "ARPU is the key issue",
                        "data": "",
                        "risk": "Weak monetization",
                    }
                ],
            ),
            patch(
                "agents.orchestrator._is_unlock_condition_met",
                return_value=False,
            ),
        ):
            result = await handle_student_message(
                target_role="CFO",
                user_message="What worries you financially?",
                history=[],
                case_context=CASE_CONTEXT,
            )

        self.assertEqual(
            set(result.keys()),
            {"reply", "evidence", "agent_name", "role_type", "role_found"},
        )
        self.assertEqual(result["agent_name"], "CFO")
        self.assertEqual(result["role_type"], "finance")
        self.assertTrue(result["role_found"])
        self.assertEqual(result["evidence"][0]["source"], "CFO")

    async def test_unknown_role_returns_fallback(self) -> None:
        """Unknown roles should not raise into the API layer."""
        result = await handle_student_message(
            target_role="Legal Counsel",
            user_message="Can you answer?",
            history=[],
            case_context=CASE_CONTEXT,
        )

        self.assertEqual(
            set(result.keys()),
            {"reply", "evidence", "agent_name", "role_found"},
        )
        self.assertEqual(result["evidence"], [])
        self.assertEqual(result["agent_name"], "Legal Counsel")
        self.assertFalse(result["role_found"])


class EvidenceParsingTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_evidence_returns_multiple_valid_items(self) -> None:
        """Extractor output should support multiple evidence items."""
        raw = """[
          {
            "key_info": "ARPU in India is $0.60 versus $5.20 globally.",
            "data": "$0.60 vs $5.20",
            "risk": "Weak monetization"
          },
          {
            "key_info": "Licensing costs consume 78% of India revenue.",
            "data": "78%",
            "risk": "Thin gross margin"
          }
        ]"""

        evidence = _parse_evidence(raw, "CFO")

        self.assertEqual(len(evidence), 2)
        self.assertEqual(evidence[0]["source"], "CFO")
        self.assertEqual(evidence[1]["data"], "78%")

    def test_parse_evidence_deduplicates_and_rejects_vague_items(self) -> None:
        """Evidence board inputs should be concrete and non-duplicative."""
        raw = """[
          {"key_info": "Market is risky", "data": "", "risk": ""},
          {"key_info": "ARPU in India is $0.60 versus $5.20 globally.", "data": "$0.60 vs $5.20", "risk": "Weak monetization"},
          {"key_info": "ARPU in India is $0.60 versus $5.20 globally.", "data": "$0.60 vs $5.20", "risk": "Weak monetization"}
        ]"""

        evidence = _parse_evidence(raw, "CFO")

        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["key_info"], "ARPU in India is $0.60 versus $5.20 globally.")

    def test_fallback_extract_evidence_captures_numeric_facts(self) -> None:
        """Evidence extraction should have a deterministic backup path."""
        reply = (
            "The fleet has a 15% annual loss from vandalism and theft. "
            "Each scooter costs $600 to manufacture. "
            "Charging logistics will be difficult without local staffing."
        )

        evidence = _fallback_extract_evidence(reply, "Head of Operations")

        self.assertGreaterEqual(len(evidence), 2)
        self.assertEqual(evidence[0]["source"], "Head of Operations")
        self.assertIn("15%", evidence[0]["data"])

    async def test_extract_evidence_falls_back_when_llm_output_is_invalid(self) -> None:
        """Invalid extractor JSON should not leave concrete replies with no evidence."""
        reply = "Average revenue per ride is $3.50, creating margin pressure."

        with patch("agents.orchestrator._llm", return_value="not json"):
            evidence = await _extract_evidence(reply, "CFO")

        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["data"], "$3.50")


if __name__ == "__main__":
    unittest.main()
