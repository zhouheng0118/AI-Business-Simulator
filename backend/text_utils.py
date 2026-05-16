"""Shared text utilities for term extraction and semantic deduplication."""

from __future__ import annotations

STOPWORDS: frozenset[str] = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "could",
    "for", "from", "has", "have", "in", "is", "it", "its", "not",
    "of", "on", "or", "our", "per", "should", "that", "the", "their",
    "they", "this", "to", "was", "we", "were", "which", "will",
    "with", "would",
})


def word_overlap_ratio(a: set[str], b: set[str]) -> float:
    """Return the Jaccard-min overlap ratio between two term sets."""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))
