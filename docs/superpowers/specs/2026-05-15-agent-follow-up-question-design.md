# Agent Follow-Up Question — Design Spec

**Date:** 2026-05-15  
**Status:** Ready for implementation planning  
**Scope:** Backend (orchestrator, sub-agents, playbook generator) + DB schema changes + frontend type update

---

## 1. Problem

Agent replies are currently one-directional: the student asks, the agent answers, and the conversation stalls. Students have no signal about what to explore next, and the Playbook's teaching goals and Checklist remain invisible to them during the interview phase.

---

## 2. Goal

Every agent reply ends with **one in-character follow-up question** that advances the student along the path the Playbook was designed to produce. The question is guided by the Playbook's Checklist, calculation challenges, info atoms, and teaching goals — but spoken in the agent's own voice.

The student's journey is **non-linear and interleaved**: they may talk to the CEO, switch to the CFO, return to the CEO, then finish with the Local Expert. There is no "finish one agent before moving on" constraint. Cross-role referrals are contextual suggestions ("go ask the CFO about this now — it'll sharpen your analysis"), not terminal states.

---

## 3. Follow-Up Modes

Six modes, evaluated in priority order each turn:

| Priority | Mode | Trigger |
|---|---|---|
| 1 | **validation** | Previous agent message in this thread contained a calculation challenge AND student's current message contains a number or analytical result |
| 2 | **unlock_probe** | Current agent has a locked info atom whose level gate is satisfied and whose unlock condition has not yet been triggered |
| 3 | **calculation_challenge** | A playbook-defined challenge owned by this role has all required data on the Evidence Board and has not yet been issued in this session |
| 4 | **checklist_probe** | There are uncompleted Checklist items with `suggested_roles` that includes this agent, and the conversation has enough context to target one |
| 5 | **cross_role_referral** | An uncompleted Checklist item's `suggested_roles` points to a different agent whose domain is relevant to the student's current question |
| 6 | **deepen** (fallback) | None of the above triggers — follow up within the current topic |

Modes are **mutually exclusive per turn**: the highest-priority triggered mode wins.

**Rationale for this order:**

- **unlock_probe at #2**: Locked facts are the core mechanic of the simulation. If a student is ready to unlock a fact (level gate passed) but never gets a hint, the game stalls. This must be prioritised above calculation challenges.
- **calculation_challenge at #3, above checklist_probe**: Calculation challenges only fire when the required data is already on the board — they are immediately actionable. Checklist probes are broader guidance that may target areas where data isn't available yet.
- **cross_role_referral at #5**: Only triggered when structured `suggested_roles` data confirms another agent owns the relevant checklist item — not by keyword heuristic alone.

---

## 4. DB Schema Changes

### 4.1 `playbooks` table — new column

```sql
ALTER TABLE playbooks
  ADD COLUMN calculation_challenges JSONB DEFAULT '[]';
```

Stores calculation challenges generated from teaching goals. Existing rows default to `[]` safely — Priority 3 finds nothing and falls through.

### 4.2 `sessions` table — new column

```sql
ALTER TABLE sessions
  ADD COLUMN follow_up_history JSONB DEFAULT '{}';
```

Tracks which follow-up `(mode, target)` pairs have been issued per role in this session, to prevent repeating them across turns (not just the last turn).

Structure:
```json
{
  "CFO": [
    {"mode": "calculation_challenge", "target": "break-even paid conversion rate"},
    {"mode": "unlock_probe", "target": "annual loss figure"}
  ],
  "CEO": [
    {"mode": "checklist_probe", "target": "Telecom partnership terms"}
  ]
}
```

### 4.3 `checklist_items` JSONB schema — new field per item

Each item within the existing `checklist_items` JSONB column gains a `suggested_roles` field:

```json
{
  "objective_index": 0,
  "task": "Break-even conversion rate",
  "completion_condition": "Student correctly calculates or discusses the break-even paid conversion rate",
  "suggested_roles": ["CFO", "finance"]
}
```

`suggested_roles`: list of role names or role_types that are the primary agents for this item. Used by both `checklist_probe` (to match the current agent) and `cross_role_referral` (to suggest a different agent). Empty list means "any agent can probe this item".

No new column needed — this is a JSONB structure change within the existing `checklist_items` column. Existing rows without `suggested_roles` are treated as `[]` (any agent can own the item).

---

## 5. Playbook Generator Changes

### 5.1 `_generate_checklist_items` — add `suggested_roles`

The existing checklist generation prompt is updated to also produce `suggested_roles` per item. The LLM already has access to the five fixed role names, so this is a prompt addition only.

Updated output schema:
```json
[
  {
    "objective_index": 0,
    "task": "Break-even conversion rate",
    "completion_condition": "...",
    "suggested_roles": ["CFO", "finance"]
  }
]
```

### 5.2 New: `_generate_calculation_challenges`

Called in `generate_playbook` alongside existing generators (runs in parallel via `asyncio.gather`).

**Input:** `teaching_goals`, `raw_content`, `roles`, `title`

**Prompt instructs the LLM to:**
1. For each teaching goal, identify 1–3 metrics a student would need to calculate to achieve that goal
2. For each metric: specify the formula hint, the specific data inputs required, and which role(s) hold those inputs
3. Include `expected_insight` — what a correct answer should reveal, used by the agent for validation mode
4. Only include metrics derivable from facts present in the case content

**Output schema:**
```json
[
  {
    "metric": "Break-even paid conversion rate",
    "formula_hint": "Total operating costs ÷ (ARPU × total MAU)",
    "required_data": ["India ARPU", "licensing cost percentage", "total MAU"],
    "owner_roles": ["CFO", "finance"],
    "objective_index": 0,
    "expected_insight": "India needs ~12% paid conversion to break even, vs current 3%"
  }
]
```

**Stored in:** `playbooks.calculation_challenges JSONB`

---

## 6. Architecture

### 6.1 New function: `_select_guide_strategy`

Location: `backend/agents/orchestrator.py`

```python
def _select_guide_strategy(
    role: dict,
    session: dict,
    playbook: dict,
    last_agent_message: str | None,
    current_student_message: str,
) -> dict:  # returns GuideContext
```

**Inputs:**
- `role`: current agent's role dict
- `session`: includes `evidence_board`, `checklist_completed`, `interviewed_roles`, `follow_up_history`
- `playbook`: includes `roles`, `info_atoms`, `checklist_items`, `calculation_challenges`, `questions`
- `last_agent_message`: last reply from this agent in the thread (for validation detection)
- `current_student_message`: student's current message

**Output:** `GuideContext` dict:

```python
{
    "mode": "calculation_challenge",
    "target_description": "break-even paid conversion rate",
    "available_data": [
        "ARPU in India: $0.60",
        "Licensing cost: 78% of revenue",
        "Telecom revenue share: 40%"
    ],
    "formula_hint": "Total costs ÷ (ARPU × total MAU)",
    "expected_insight": "India needs ~12% paid conversion vs current 3%",
    "target_roles": [],
    "uncompleted_checklist_hints": [],
    "stage_description": "Mid-conversation — 2 exchange(s) so far",
    "priority_rationale": "ARPU and cost data on board; challenge not yet issued"
}
```

### 6.2 Modified: `_build_system_prompt`

Location: `backend/agents/sub_agents.py`

New parameter: `guide_context: dict | None = None`

When provided, a `[GUIDE]` block is appended after existing content. See Section 7.

### 6.3 Call chain

`handle_student_message` and `handle_message_stream` both:
1. Extract `last_agent_message` from history (last message where `role == "agent"` and `agent_name == role["name"]`)
2. Call `_select_guide_strategy(...)` before `call_sub_agent`
3. Pass `guide_context` through to `call_sub_agent` / `stream_sub_agent` → `_build_system_prompt`

### 6.4 Follow-up history persistence

After a successful agent reply, persist the issued follow-up to `sessions.follow_up_history`. This happens in `_background_post_process` alongside evidence extraction.

```python
db.record_follow_up(session_id, role_name, mode, target_description)
```

`record_follow_up` does a JSONB append into `sessions.follow_up_history[role_name]`.

---

## 7. Prompt Injection Template

Appended at the end of the system prompt:

```
---
[GUIDE — MANDATORY FOLLOW-UP]
After your main response, end with exactly ONE follow-up question. No preamble, no label.

Conversation stage: {stage_description}
Mode: {mode}

{mode_instructions}

Rules:
- Speak entirely as {name} — no narrator voice, no meta-commentary
- Maximum 2 sentences for the follow-up
- Never reveal locked information in the follow-up question
- Do not repeat any follow-up question you have already asked this student:
  {already_used_followups}
```

**`{mode_instructions}` by mode:**

**validation:**
```
The student has provided a calculation or analytical result. Evaluate it using the data below.
If the reasoning is directionally correct: affirm briefly, then push one level deeper.
If the reasoning has a gap: probe the specific gap without giving the answer away.
Expected correct insight: {expected_insight}
Reference data: {available_data}
```

**unlock_probe:**
```
There is a deeper dimension to this topic the student hasn't reached yet.
Ask a question that points them in the right direction without revealing the hidden content.
Hint direction (do NOT quote this directly): {target_description}
```

**calculation_challenge:**
```
Challenge the student to calculate: {target_description}
Formula approach: {formula_hint}
In your follow-up, provide ALL of the following data — the student needs them to compute the answer:
{available_data}
Give the numbers naturally in character, then ask the student what they conclude.
```

**checklist_probe:**
```
Guide the student toward this unexplored area (do NOT quote the label directly):
{uncompleted_checklist_hints}
Ask a question that makes them want to investigate this.
```

**cross_role_referral:**
```
The most valuable next step for the student is to speak with: {target_roles}
In character, suggest this and briefly explain why it matters for the current analysis.
Make clear they can return to you afterward.
```

**deepen:**
```
Ask a follow-up that pushes the student to think about implications, trade-offs, or next steps
that follow naturally from what you just said.
```

---

## 8. Guide Strategy Selection Logic (detail)

### Priority 1 — Validation

Detection (no LLM call):
- `last_agent_message` contains "calculate", "work out", "what does that give", "can you compute"
- `current_student_message` contains a digit, `%`, or `$`

`available_data`: evidence board items where `source == role["name"]`  
`expected_insight`: from `calculation_challenges` entry that matches the last challenge issued (looked up via `follow_up_history`)

### Priority 2 — Unlock probe

```python
unlockable = [
    a for a in info_atoms
    if _info_atom_owned_by_role(a, role)
    and a["access"] == "locked"
    and _level_gate_passed(a, session)
    and not _already_unlocked(a, evidence_board)
    and not _follow_up_already_used(session, role["name"], "unlock_probe", a["fact"][:40])
]
```

Take the lowest-level (level 1 first, then 2, then 3) unlockable atom. `target_description` is a paraphrase of the atom's domain, **not** the locked fact text itself.

### Priority 3 — Calculation challenge

```python
available_challenges = [
    c for c in playbook.get("calculation_challenges", [])
    if _challenge_owned_by_role(c, role)
    and _required_data_on_board(c["required_data"], evidence_board)
    and not _follow_up_already_used(session, role["name"], "calculation_challenge", c["metric"])
]
```

`_required_data_on_board`: checks that each label in `required_data` has a fuzzy match in `evidence_board` items from this role (matches on key_info or data fields).

Take the first available challenge. Pass `formula_hint` and `expected_insight` into the GuideContext.

### Priority 4 — Checklist probe

```python
uncompleted = [
    item for i, item in enumerate(checklist_items)
    if i not in completed_set
    and _checklist_item_for_role(item, role)
    and not _follow_up_already_used(session, role["name"], "checklist_probe", item["task"])
]
```

`_checklist_item_for_role`: returns True if `item["suggested_roles"]` is empty (any agent) OR contains this role's name or role_type.

Take up to 3 uncompleted items as `uncompleted_checklist_hints`.

### Priority 5 — Cross-role referral

```python
referral_candidates = []
for item in uncompleted_checklist_items:
    for suggested_role_name in item.get("suggested_roles", []):
        candidate = _find_role(playbook["roles"], suggested_role_name)
        if candidate and candidate["name"] != role["name"]:
            referral_candidates.append((candidate, item))
```

A referral fires if:
1. At least one uncompleted checklist item has a `suggested_roles` that is a different agent, AND
2. The `item["task"]` has word overlap ≥ 30% with `current_student_message` OR with `role["focus_area"]`

The word-overlap check is a secondary filter to avoid irrelevant referrals, not the primary mechanism. The primary signal is the structured `suggested_roles` data.

`target_roles`: list of the candidate role names to suggest.

### Priority 6 — Deepen (fallback)

Always available. No additional data needed.

---

## 9. `_follow_up_already_used` helper

```python
def _follow_up_already_used(
    session: dict, role_name: str, mode: str, target: str
) -> bool:
    history = (session.get("follow_up_history") or {}).get(role_name, [])
    return any(
        entry["mode"] == mode and entry["target"] == target
        for entry in history
    )
```

This prevents repeating the same `(mode, target)` pair across **all turns** in the session, not just the previous turn. The `target` key is a truncated identifier (e.g., metric name, atom domain, checklist task label) — not the full question text.

---

## 10. Starting Question Integration

`opening_suggested_question` is displayed by the frontend as before. No changes needed.

When a student uses the starting question as their first message:
- `follow_up_history` for this agent is empty
- `checklist_completed` is empty
- Evidence Board has no entries from this agent
- No locked atoms have level gate satisfied yet (no prior roles visited)

`_select_guide_strategy` will select **Priority 4 (checklist_probe)** targeting the first uncompleted checklist item with `suggested_roles` matching this agent — naturally creating the "Starting Question → first guided step" entry point.

---

## 11. What Does Not Change

- Evidence extraction (`_extract_evidence`, `_background_post_process`)
- Checklist completion evaluation (`_check_checklist_items`)
- Unlock condition evaluation (`_compute_allowed_info`)
- Streaming infrastructure (`handle_message_stream`, `stream_sub_agent`)
- Frontend API response shape (`reply` field carries the follow-up as part of the text)

---

## 12. Files Changed

| File | Change |
|---|---|
| `schema.sql` | Add `calculation_challenges JSONB DEFAULT '[]'` to `playbooks`; add `follow_up_history JSONB DEFAULT '{}'` to `sessions` |
| `backend/database.py` | Add `record_follow_up()`; ensure new columns returned in `get_playbook_by_case` and `get_session` |
| `backend/agents/orchestrator.py` | Add `_select_guide_strategy()`, `_follow_up_already_used()`; update `handle_student_message`, `handle_message_stream`, `_background_post_process` |
| `backend/agents/sub_agents.py` | Add `guide_context` param to `call_sub_agent`, `stream_sub_agent`, `_build_system_prompt` |
| `backend/agents/playbook_generator.py` | Update `_generate_checklist_items` prompt to produce `suggested_roles`; add `_generate_calculation_challenges()`; wire into `generate_playbook` |
| `frontend/src/lib/api.ts` | Add `calculation_challenges: ApiCalculationChallenge[]` to `ApiPlaybook`; add `follow_up_history` to `ApiSession` (optional, for future analytics) |
| `backend/tests/test_live_agents.py` | Add assertions: reply ends with `?`; follow-up mode matches expected given session state |

---

## 13. Out of Scope

- Professor-side UI for reviewing generated calculation challenges
- Analytics dashboard for follow-up mode distribution
- Multi-language follow-up question generation (currently English only, matching agent prompts)
