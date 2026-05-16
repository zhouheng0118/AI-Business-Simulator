"""Prompt for generating opening card fields for all stakeholder roles."""

from __future__ import annotations


def build(title: str, content_excerpt: str, roles_list: str, guidance: str) -> str:
    return f"""You are generating opening card content for a business school simulation.

Case Title: {title}

Case Content:
{content_excerpt}

Generate opening card content for each of these stakeholder roles:
{roles_list}

Per-role guidance:
{guidance}

Return ONLY valid JSON array, no markdown:
[
  {{
    "name": "<exact role name>",
    "opening_role_description": "<one sentence, specific to THIS case>",
    "opening_topics": ["<case-specific topic 1>", "<topic 2>", "<topic 3>", "<topic 4>"],
    "opening_suggested_question": "<one concrete question a student can ask to learn something important>"
  }}
]

Requirements:
- Exactly 5 items, one per role
- opening_role_description: one sentence describing this stakeholder's role in THIS case specifically
- opening_topics: 4-6 topics drawn from THIS case's facts, not generic role descriptions
- opening_suggested_question: one concrete, case-specific starting question"""
