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

    def test_append_unique_evidence_skips_runway_rephrasing(self) -> None:
        """Same-source evidence with same numbers and signal terms should merge."""
        board = [
            {
                "source": "CFO",
                "key_info": "The company has a 12-month cash runway based on a $20M burn.",
                "data": "12 months, $20M",
                "risk": "Rapid capital depletion.",
            }
        ]
        new_evidence = [
            {
                "source": "CFO",
                "key_info": "The company has a maximum runway of 12 months based on $20M in reserves.",
                "data": "12 months, $20M",
                "risk": "Narrow window to achieve scale.",
            }
        ]

        updated = _append_unique_evidence(board, new_evidence)

        self.assertEqual(len(updated), 1)

    def test_append_unique_evidence_skips_liquidity_fact_split(self) -> None:
        """A repeated answer should not split one liquidity fact into several facts."""
        board = [
            {
                "source": "CFO",
                "key_info": "The company has $20M in cash, providing a runway of 12 months.",
                "data": "12 months, $20M",
                "risk": "Potential liquidity crisis.",
            }
        ]
        new_evidence = [
            {
                "source": "CFO",
                "key_info": "The company has $20 million in available funding.",
                "data": "$20M",
                "risk": "Limited capital to achieve product-market fit and scale.",
            },
            {
                "source": "CFO",
                "key_info": "The current funding provides a runway of 12 months under a high burn rate.",
                "data": "12 months",
                "risk": "Need to seek more funding if break-even is not achieved quickly.",
            },
        ]

        updated = _append_unique_evidence(board, new_evidence)

        self.assertEqual(len(updated), 1)


if __name__ == "__main__":
    unittest.main()
