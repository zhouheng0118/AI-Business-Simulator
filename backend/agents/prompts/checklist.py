"""Prompt for generating investigation checklist items per teaching goal."""

from __future__ import annotations


def build(title: str, goals_text: str, content_excerpt: str) -> str:
    return f"""You are designing an investigation checklist for business school students.

Case Title: {title}

Teaching Goals (what students must learn):
{goals_text}

Case Content (excerpt):
{content_excerpt}

For EACH teaching goal, generate 3-5 specific investigation tasks that a student must complete through stakeholder interviews to achieve that goal.

Each task must be:
- Concrete and actionable (what to ask / discover)
- Verifiable through conversation (you can tell when it's done)
- Tied to at least one specific stakeholder in this case

Return ONLY valid JSON, no markdown:
[
  {{
    "objective_index": 0,
    "task": "<topic label noun phrase, e.g. 'Cash runway timeline' or 'Revenue growth assumptions'>",
    "completion_condition": "<specific: what the student must ask or demonstrate in conversation for this to count as done>"
  }}
]

Requirements:
- objective_index is 0-based (0 = first goal, 1 = second goal, etc.)
- task is ≤8 words, noun phrase (topic label), specific to this case — do NOT use "Ask [role] about" framing
- completion_condition is one sentence, concrete, evaluatable by reading conversation history
- Generate 3-5 items per teaching goal — no more, no less
- Cover different stakeholders across the items for each goal"""
