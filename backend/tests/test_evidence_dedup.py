"""Tests for evidence board deduplication."""

from __future__ import annotations

import unittest

from database import _append_unique_evidence, _is_semantic_duplicate


class EvidenceDeduplicationTests(unittest.TestCase):
    def test_semantic_duplicate_matches_near_duplicate_same_source(self) -> None:
        existing = {
            "source": "CFO",
            "key_info": "The projected average revenue per ride is $3.50.",
            "data": "$3.50",
            "risk": "Thin margins.",
        }
        candidate = {
            "source": "CFO",
            "key_info": "Average revenue per ride is currently projected at $3.50.",
            "data": "$3.50",
            "risk": "Margin pressure.",
        }

        self.assertTrue(_is_semantic_duplicate(existing, candidate))

    def test_semantic_duplicate_rejects_conflicting_numbers(self) -> None:
        existing = {
            "source": "CFO",
            "key_info": "The projected average revenue per ride is $3.50.",
            "data": "$3.50",
            "risk": "Thin margins.",
        }
        candidate = {
            "source": "CFO",
            "key_info": "Average revenue per ride is currently projected at $4.25.",
            "data": "$4.25",
            "risk": "Margin pressure.",
        }

        self.assertFalse(_is_semantic_duplicate(existing, candidate))

    def test_semantic_duplicate_is_scoped_by_source(self) -> None:
        existing = {
            "source": "CFO",
            "key_info": "Average revenue per ride is $3.50.",
            "data": "$3.50",
            "risk": "Thin margins.",
        }
        candidate = {
            "source": "Customer Rep",
            "key_info": "Average revenue per ride is $3.50.",
            "data": "$3.50",
            "risk": "Price sensitivity.",
        }

        self.assertFalse(_is_semantic_duplicate(existing, candidate))

    def test_append_unique_evidence_skips_near_duplicates(self) -> None:
        board = [
            {
                "source": "Head of Operations",
                "key_info": "Vandalism and theft are the primary drivers of fleet attrition.",
                "data": "",
                "risk": "Hardware loss.",
            }
        ]
        new_evidence = [
            {
                "source": "Head of Operations",
                "key_info": "Fleet attrition is primarily driven by vandalism and theft.",
                "data": "",
                "risk": "Hardware loss.",
            },
            {
                "source": "Head of Operations",
                "key_info": "Charging logistics are a nightly operational bottleneck.",
                "data": "",
                "risk": "Execution risk.",
            },
        ]

        updated = _append_unique_evidence(board, new_evidence)

        self.assertEqual(len(updated), 2)
        self.assertEqual(
            updated[1]["key_info"],
            "Charging logistics are a nightly operational bottleneck.",
        )


if __name__ == "__main__":
    unittest.main()
