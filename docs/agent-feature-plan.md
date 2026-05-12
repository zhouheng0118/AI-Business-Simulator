# CaseIQ Agent Feature Plan

Last updated: 2026-05-12

## Product Goal

Build a business-school interview Agent that evaluates how students investigate under uncertainty. The Agent should not behave like a generic chatbot; it should create a controlled decision simulation with stakeholder boundaries, hidden information, and an auditable evidence trail.

## Current Build Priority

The interview loop is the core product surface and has now passed a real smoke test on the EcoRide case:

```text
student question
-> role routing
-> unlock evaluation
-> scoped stakeholder prompt
-> role-play answer
-> evidence extraction
-> evidence board update
-> sufficiency signal
```

Do not prioritize uploads, scoring, streaming, or UI polish until this loop is stable.

Latest validated path:

- `GET /cases`
- `POST /sessions`
- `POST /sessions/{id}/messages`
- `GET /sessions/{id}`
- `GET /sessions/{id}/evidence`

EcoRide smoke test result:

- Interviewed `CFO`, `City Official`, and `Head of Operations`.
- Received non-fallback role-play answers.
- Persisted 11 evidence items.
- Persisted 3 visited roles.
- Returned `info_sufficient: true`.

## Agent Design Principles

1. Do not put locked fact text into a sub-agent prompt before unlock.
2. Let the orchestrator own information release.
3. Let each stakeholder see only its own conversation thread.
4. Store evidence as structured data, not as conversation summaries.
5. Treat fallback replies as incidents to diagnose, not acceptable role answers.
6. Use tests to freeze information-boundary behavior before prompt tuning.

## Phase 1 Definition of Done

A session can:

- Create a student interview session.
- Ask CFO, Local Expert, and Head of Operations questions.
- Receive non-fallback, in-character answers from each role.
- Persist student and agent messages in Supabase.
- Persist at least 3 concrete evidence items.
- Show at least 3 roles in `roles_visited`.
- Return `info_sufficient: true` after enough roles and evidence.
- Avoid exposing locked information before unlock.

Status: Passed for EcoRide with `CFO`, `City Official`, and `Head of Operations`.

Important product learning:

- The product should not assume every case uses the exact same role names.
- EcoRide uses `City Official` as the local/regulatory stakeholder.
- Spotify India uses `Local Expert` as the local/regulatory stakeholder.
- The system needs stable internal role types with case-specific display names.

## Agent Role Contract v1

MVP should use five stable role types:

| `role_type` | Product function | Example display names |
|---|---|---|
| `strategy` | Growth pressure, board priorities, strategic options | CEO, Founder, General Manager |
| `finance` | Unit economics, cash flow, ROI, runway | CFO, Finance Director |
| `operations` | Execution reality, staffing, supply chain, launch risk | Head of Operations, VP Ops |
| `local_regulatory` | Local market structure, regulation, policy, partner context | Local Expert, City Official, Regulator |
| `customer_market` | User behavior, willingness to pay, alternatives, switching friction | Customer Rep, Rider, User Representative |

Playbook role objects should evolve toward:

```json
{
  "role_type": "local_regulatory",
  "name": "City Official",
  "title": "Paris Transport Commissioner",
  "persona": "...",
  "focus_area": "...",
  "allowed_info": [],
  "locked_info": [],
  "unlock_conditions": "..."
}
```

Routing rule:

```text
role_type match -> name/title alias match -> fallback
```

Prompt selection rule:

```text
role_type prompt -> name/title prompt -> generic prompt
```

Status: Implemented in code.

Implementation notes:

- New playbooks should include explicit `role_type`.
- Existing playbooks remain compatible because the backend infers role type from `name`, `title`, and `focus_area`.
- Routing first honors an exact display label match, then falls back to role type matching.
- `City Official` and `Local Expert` both resolve to `local_regulatory`.
- `CFO` resolves to `finance`; `Head of Operations` resolves to `operations`.

Next validation:

- Re-run EcoRide smoke test with `City Official`.
- Re-run Spotify smoke test with `Local Expert`.
- Test sending `role_name: "local_regulatory"` directly to confirm stable frontend routing can work.

## Phase 2: Boundary Hardening

Add and keep adversarial tests for:

- Prompt disclosure attempts.
- Hidden fact extraction attempts.
- Role-switching attempts.
- Professor/database impersonation.
- Cross-role questions.
- Leading questions containing guessed confidential facts.

Expected behavior:

- The orchestrator does not unlock facts unless the condition is met.
- The sub-agent prompt does not contain locked fact text before unlock.
- The stakeholder redirects out-of-scope questions naturally.

## Phase 3: Evidence Quality

Improve evidence extraction so the board is useful for scoring:

- Return multiple evidence items per turn.
- Deduplicate by `source + key_info`.
- Reject vague facts.
- Keep concrete numbers, quotes, and decision risks.
- Use a deterministic fallback when the model-based extractor fails.
- Add confidence or evidence type later if scoring needs it.

## Phase 4: Case Quality

Once the loop is stable, create two strong cases:

- A clean demo case for investor/product demos.
- A teaching case with hidden tradeoffs and richer unlock conditions.

Each case should include:

- 5 stakeholders.
- 10-15 allowed facts.
- 5-8 locked facts.
- 3 final questions.
- A rubric tied to evidence use and investigation quality.

## Phase 5: Scoring And Debrief

Only build scoring after evidence is reliable:

- Score each final answer against rubric dimensions.
- Replay interview path.
- Identify missed stakeholders and missed evidence.
- Explain blind spots without overclaiming.
