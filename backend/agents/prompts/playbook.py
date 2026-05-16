"""Prompt for generating the main simulation playbook."""

from __future__ import annotations


def build(
    title: str,
    case_type: str,
    goals_text: str,
    content_excerpt: str,
    role_guidance: str,
    opening_guidance: str,
    roles_schema: str,
) -> str:
    return f"""You are generating a structured AI simulation playbook for a business school case study.

Case Title: {title}
Case Type: {case_type}
Teaching Goals: {goals_text}

Case Content:
{content_excerpt}

Generate a background summary, exactly 5 stakeholder roles, and 2-3 discussion questions.

Each role's domain focus:
{role_guidance}

Each role's opening card guidance:
{opening_guidance}

Return ONLY valid JSON, no markdown:
{{
  "background_summary": "<150-200 word student-facing case background: company context, the central decision or challenge, and why it matters now — use only publicly available facts, no hidden information>",
  "roles": {roles_schema},
  "info_atoms": [
    {{
      "fact": "<specific factual atom from this case>",
      "owner_roles": ["<one role name from the roles list>"],
      "access": "allowed",
      "unlock_condition": ""
    }},
    {{
      "fact": "<specific hidden/deeper factual atom from this case>",
      "owner_roles": ["<one role name from the roles list>"],
      "access": "locked",
      "unlock_condition": "<what the student must ask to unlock this fact>"
    }}
  ],
  "questions": [
    {{
      "id": "q1",
      "type": "{case_type}",
      "text": "<a specific, challenging question directly tied to this case's core decision or tension>",
      "rubric_dimensions": [
        {{"name": "Evidence Use", "weight": 25}},
        {{"name": "Analytical Depth", "weight": 25}},
        {{"name": "Recommendation Quality", "weight": 25}},
        {{"name": "Risk Awareness", "weight": 25}}
      ]
    }}
  ]
}}

Requirements:
- background_summary: 150-200 words, written for a student who has not read the case. No hidden or locked information.
- Use exactly these 5 role names and role_type values from the schema
- Each role's allowed_info: 4-5 specific, concrete facts grounded in THIS case (names, numbers, constraints)
- Each role's locked_info: 1-3 deeper facts, risks, tradeoffs, or implications from the case
- Each role must have a concrete unlock_conditions sentence
- Each role's opening_role_description: one sentence, case-specific, describing this stakeholder's role in THIS case's context
- Each role's opening_topics: 4-6 specific topics drawn from THIS case's facts, not generic role descriptions
- Each role's opening_suggested_question: one concrete, case-specific question the student can start with
- info_atoms must include both allowed and locked facts and must use owner_roles that match the role names or role_type values
- Facts must be grounded in THIS case (names, numbers, constraints mentioned in the content)
- The CEO and CFO may share some overlapping strategic/financial facts
- Generate 2-3 final questions when possible: one decision question, one analysis question, and optionally one reflection question
- Questions must be specific to this case's central dilemma — not generic"""
