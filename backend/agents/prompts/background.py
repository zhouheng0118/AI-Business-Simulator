"""Prompt for synthesizing a student-facing background paragraph."""

from __future__ import annotations


def build(facts_text: str) -> str:
    return f"""You are writing a case briefing for business school students.

Below are the publicly known facts about this business case, grouped by category:

{facts_text}

Write a single, cohesive paragraph (150–200 words) that presents these facts as a unified case brief.
Requirements:
- Write in clear, professional prose — no bullet points, no headers, no lists
- Weave all the facts naturally into the narrative
- Begin with who the company is and what decision they face
- Include the key numbers and visible tensions
- Mention each stakeholder's role briefly where relevant
- End with a sentence that frames why this decision is consequential
- Write as if briefing a student who has not read the case

Return only the paragraph text, nothing else."""
