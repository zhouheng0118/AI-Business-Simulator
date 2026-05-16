"""Prompt for generating info atoms from case content."""

from __future__ import annotations


def build(
    title: str,
    goals_instruction: str,
    content_excerpt: str,
    roles_context: str,
    per_goal_counts: str,
    per_locked_counts: str,
) -> str:
    return f"""You are analyzing a business case to map its information into two layers for a student simulation.

Case Title: {title}
{goals_instruction}

Case Content:
{content_excerpt}

Each stakeholder's already-public basic facts:
{roles_context}

STEP 1 — RELEVANCE FILTER
Only include facts that affect the student's ability to achieve the teaching goals above.
Discard facts irrelevant to all goals (e.g. company history unrelated to the decision, office locations, founder bios).

STEP 2 — CLASSIFY EACH FACT
Classify each retained fact using these rules:

BASIC LAYER ("allowed") — use if ANY of these is true:
1. Publicly available or known to all parties
2. Students need it to know which questions to ask
3. Describes the core decision context or a stakeholder's official responsibilities
4. Describes a visible tension without revealing its root cause

HIDDEN LAYER ("locked") — use only if ALL of these are true:
1. Revealing it would materially change the student's analysis
2. The stakeholder has a realistic motive to withhold it
3. It can only be surfaced by a student thinking in the right direction

STEP 2b — ASSIGN CATEGORY (allowed atoms only)
- company_background: founding story, market size, competitive landscape, who the company is
- decision_context: the specific decision being made, its timeline, constraints, and stakeholder pressures
- role_statement: this stakeholder's official responsibility and mandate in this case
- visible_tension: a publicly acknowledged conflict, risk, or tradeoff without its root cause
- public_numbers: revenue, market size, pricing, headcount, or other public quantitative data

STEP 3 — ASSIGN UNLOCK DIFFICULTY (locked atoms only)
- level 1: Student only needs to ask about the right topic (no prerequisites)
- level 2: Student must question a basic-layer assumption OR get a clue from another agent first
- level 3: Student must cross-reference info from TWO OR MORE agents to even know to ask this

Return ONLY valid JSON array, no markdown:
[
  {{
    "fact": "<one concrete fact, include numbers where relevant>",
    "owner_roles": ["<role name>"],
    "access": "allowed",
    "unlock_condition": "",
    "level": 0,
    "category": "decision_context",
    "objective_index": 0
  }},
  {{
    "fact": "<hidden fact that materially changes the analysis>",
    "owner_roles": ["<role name>"],
    "access": "locked",
    "unlock_condition": "<specific trigger: what the student must ask or demonstrate>",
    "level": 2,
    "category": "",
    "objective_index": 1
  }}
]

Requirements:
{per_goal_counts}
{per_locked_counts}
- Locked facts must be substantive: undisclosed financial risk, competitive threat, regulatory constraint, internal conflict
- unlock_conditions must be specific ("Student asks why the growth projection assumes 30% and what supports it" not "Student asks about growth")
- level must be 0 for allowed, 1/2/3 for locked
- Each atom belongs to 1-2 roles maximum
- objective_index must match one of the goal indices above
- category must be one of the five allowed categories for allowed atoms; empty string for locked atoms
- Each "fact" must be ≤ 25 words; each "unlock_condition" must be ≤ 25 words"""
