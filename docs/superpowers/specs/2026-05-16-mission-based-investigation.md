# Spec: Mission-Based Investigation Flow

**Date:** 2026-05-16  
**Status:** Draft  
**Scope:** Backend orchestrator + frontend session page

---

## 1. Problem

The current "free-form multi-agent chat" model lets students jump between any of the 5 agents in any order. This produces shallow, unfocused conversations and makes checklist completion unreliable (it currently triggers on keyword matching, not substantive understanding). There is no guided learning path.

The target model: CEO acts as an investigation orchestrator. Students receive one mission at a time, visit the assigned agent(s), and report back to CEO. CEO evaluates the report and decides whether the mission is complete before unlocking the next one.

---

## 2. New Interaction Flow

```
Session start
    │
    ▼
[CEO] Opens with: roadmap overview + Mission 1 briefing
    │  (tells student which agent to visit, what to collect)
    │
    ▼
Student selects assigned sub-agent (other agents are locked)
    │
    ▼
[Sub-Agent] Answers questions, provides role-scoped facts
    │  (no checklist logic in sub-agent — just information)
    │
    ▼
Student returns to CEO and reports findings
    │
    ▼
[CEO] Evaluates report against mission completion criteria
    ├── Incomplete → explains what is missing, redirects back to sub-agent
    └── Complete   → marks mission done, presents next mission briefing
    │
    ▼
Repeat for Missions 2 → 5
    │
    ▼
All 5 missions complete → "Proceed to Answer" unlocked
```

---

## 3. Mission Definitions

Missions are case-agnostic structure; the CEO prompt injects case-specific facts. The 5 missions below are used for the ERP case (and as a template for others).

| # | Mission Title | Assigned Agent(s) | Focus Areas | Completion Criteria |
|---|---|---|---|---|
| 1 | Diagnose current operational bottlenecks | Operations Director | Fragmented info systems, inventory visibility, SKU complexity, distribution flow | Student can name ≥2 specific operational bottlenecks AND explain why fragmented systems cause them |
| 2 | Understand customer and market impact | Customer Representative | Product availability, delivery lead time, contractor requirement, customer switching risk | Student can describe how current bottlenecks affect customers AND quantify switching risk |
| 3 | Quantify the financial case | CFO | CapEx, software license costs, benefits, savings, margin improvement, inventory reduction, discount rate, tax rate | Student can articulate the NPV/ROI case with at least the key cost and benefit line items |
| 4 | Examine implementation costs and constraints | CFO + Operations Director | Implementation employees, consultants, task force, ongoing system costs, wave implementation | Student understands total implementation cost structure AND phasing/wave constraints |
| 5 | Evaluate downside risks and final decision assumptions | Local Expert + CFO + Operations Director | Off-the-shelf ERP risk, process change resistance, employee concerns, sensitivity of financial assumptions | Student can identify ≥2 downside risks AND explain which financial assumptions most affect the decision |

---

## 4. Session State: New `mission_state` Field

Add `mission_state` JSONB to the `sessions` table. It tracks all mission-related state and is the single source of truth for which agents are accessible.

### Schema

```sql
-- Add to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS
  mission_state JSONB DEFAULT '{
    "current_mission": 0,
    "phase": "briefing",
    "active_agents": ["CEO"],
    "missions_completed": [],
    "mission_reports": {}
  }';
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `current_mission` | int (0-indexed) | Which mission is active (0 = M1, 4 = M5) |
| `phase` | string | `"briefing"` \| `"investigating"` \| `"evaluating"` \| `"complete"` |
| `active_agents` | string[] | Which agents the student can currently message. Always includes `"CEO"`. |
| `missions_completed` | int[] | Indices of completed missions |
| `mission_reports` | object | Keyed by mission index → student's report summary (stored after CEO completes evaluation) |

### Phase transitions

```
"briefing"     → student receives mission briefing from CEO
"investigating" → student visits sub-agent(s); CEO is still reachable
"evaluating"   → student returns to CEO; CEO evaluates report
"complete"     → all 5 missions done; proceed button unlocked
```

The transition from `"investigating"` → `"evaluating"` happens when student sends a message to CEO (detected in orchestrator). The transition from `"evaluating"` → `"briefing"` (next mission) or `"complete"` happens when CEO's evaluation response is parsed as "mission complete."

---

## 5. Backend Changes

### 5.1 `schema.sql`

Add `mission_state` column (see section 4).

### 5.2 `database.py`

Add one new function:

```python
def update_mission_state(session_id: str, mission_state: dict) -> None:
    _get_client().table("sessions").update(
        {"mission_state": mission_state}
    ).eq("id", session_id).execute()
```

Modify `create_session()` to include `mission_state` in the initial insert row.

### 5.3 `agents/missions.py` (new file)

Define the 5 missions as a typed structure. This is the authoritative source — both orchestrator and playbook generator can import from here.

```python
MISSIONS = [
    {
        "index": 0,
        "title": "Diagnose current operational bottlenecks",
        "active_agents": ["Operations Director"],
        "focus_areas": [
            "Fragmented information systems across locations",
            "Inventory visibility and accuracy",
            "SKU complexity and product mix",
            "Distribution flow and fulfillment process",
        ],
        "completion_criteria": (
            "Student has identified at least 2 specific operational bottlenecks "
            "AND can explain why fragmented systems are their root cause."
        ),
        "briefing_instruction": (
            "Go speak with the Operations Director. Ask specifically about: "
            "the current state of their information systems, inventory visibility problems, "
            "SKU complexity, and how products flow through distribution. "
            "Come back and tell me what the 2-3 biggest operational bottlenecks are."
        ),
    },
    {
        "index": 1,
        "title": "Understand customer and market impact",
        "active_agents": ["Customer Representative"],
        "focus_areas": [
            "Product availability and stockout frequency",
            "Delivery lead time to contractors",
            "Contractor ordering requirements",
            "Customer switching risk and loyalty drivers",
        ],
        "completion_criteria": (
            "Student understands how current operational problems affect customers "
            "AND can articulate the risk of customer attrition if problems continue."
        ),
        "briefing_instruction": (
            "Now speak with our Customer Representative. Find out: "
            "how often products are unavailable, what contractors need in terms of delivery time, "
            "and how likely they are to switch to a competitor if service doesn't improve."
        ),
    },
    {
        "index": 2,
        "title": "Quantify the financial case",
        "active_agents": ["CFO"],
        "focus_areas": [
            "Capital expenditure for ERP implementation",
            "Software license costs (ongoing)",
            "Expected benefits: inventory reduction, margin improvement",
            "Discount rate and tax rate for NPV calculation",
        ],
        "completion_criteria": (
            "Student can articulate the key cost and benefit line items for the ERP investment "
            "AND understands the financial parameters needed to evaluate the business case."
        ),
        "briefing_instruction": (
            "Visit the CFO. You need to understand the full financial case: "
            "what it costs to implement the ERP system, what the ongoing costs are, "
            "and what financial benefits we expect — especially inventory reduction and margin improvement. "
            "Also find out what discount rate and tax rate to use for any NPV analysis."
        ),
    },
    {
        "index": 3,
        "title": "Examine implementation costs and constraints",
        "active_agents": ["CFO", "Operations Director"],
        "focus_areas": [
            "Implementation team: employees and consultants required",
            "Dedicated task force requirements",
            "Ongoing system maintenance costs",
            "Wave implementation structure and timeline constraints",
        ],
        "completion_criteria": (
            "Student understands the total people-cost of implementation "
            "AND knows why a phased/wave approach is required."
        ),
        "briefing_instruction": (
            "You need to go back to the CFO and Operations Director — both of them. "
            "Ask specifically about: how many people are needed to implement this system, "
            "whether we need outside consultants, what a dedicated task force looks like, "
            "and why the implementation has to be phased in waves rather than all at once."
        ),
    },
    {
        "index": 4,
        "title": "Evaluate downside risks and final decision assumptions",
        "active_agents": ["Local Expert", "CFO", "Operations Director"],
        "focus_areas": [
            "Off-the-shelf ERP fit vs. custom configuration risk",
            "Process change and employee resistance",
            "Implementation failure risk",
            "Sensitivity of NPV to key financial assumptions",
        ],
        "completion_criteria": (
            "Student has identified at least 2 specific downside risks "
            "AND can explain which financial assumptions most affect whether the investment is justified."
        ),
        "briefing_instruction": (
            "Final mission. Talk to the Local Expert, CFO, and Operations Director about risks. "
            "Specifically: how well does an off-the-shelf ERP fit our processes, "
            "what happens if employees resist the change, "
            "and which of our financial assumptions — cost, benefits, timeline — "
            "would most change the investment decision if they turned out to be wrong."
        ),
    },
]
```

### 5.4 `agents/orchestrator.py`

This is the largest change. The key architectural decision: **CEO messages go through a separate `handle_ceo_message()` path**; all other agents go through the existing path but with access control added.

#### 5.4.1 Access control on every message

At the start of `handle_message()` and `handle_message_stream()`, add:

```python
mission_state = session.get("mission_state") or {}
active_agents = mission_state.get("active_agents") or ["CEO"]

# If the requested agent is not active, return a lock message
if role_name not in active_agents and not _is_ceo_role(role_name):
    return {
        "reply": f"You haven't been assigned to speak with {role_name} yet. Return to the CEO for your next mission.",
        "agent_name": role_name,
        "info_sufficient": False,
        "roles_visited": session.get("interviewed_roles") or [],
        "mission_state": mission_state,
    }
```

`_is_ceo_role()` checks if the role_name maps to the CEO/strategy role type.

#### 5.4.2 CEO routing

When the requested agent is CEO, call `handle_ceo_message()` instead of the regular sub-agent flow:

```python
if _is_ceo_role(role_name):
    return await handle_ceo_message(session_id, session, playbook, history, student_message)
```

#### 5.4.3 `handle_ceo_message()` logic

```
phase = mission_state["phase"]

if phase == "briefing":
    # CEO gives mission briefing (may be first turn or after completing previous mission)
    # Build CEO orchestrator prompt with current mission briefing
    # After reply: set phase = "investigating", set active_agents = [assigned agents]

if phase == "investigating":
    # Student is talking to CEO while supposed to be investigating
    # Detect intent: is student reporting back, or just asking a question?
    # If it looks like a report (heuristic: has substance about the sub-agent topic):
    #   → treat as reporting, set phase = "evaluating", evaluate mission
    # Else:
    #   → remind student of current mission, redirect to sub-agent

if phase == "evaluating":
    # CEO evaluates the student's report
    # CEO prompt includes: mission completion criteria + student's current message
    # Parse CEO response for completion verdict (look for structured marker in response)
    # If complete: advance mission, set phase = "briefing" for next mission (or "complete")
    # If not complete: redirect student with specific missing pieces
```

**How the CEO determines "complete":**

The CEO's system prompt asks it to include a machine-readable marker at the end of its evaluation:
```
<mission_verdict>COMPLETE</mission_verdict>
or
<mission_verdict>INCOMPLETE</mission_verdict>
```

The orchestrator strips this before returning to the frontend, but uses it to drive state transitions. This is the same pattern as the existing `<boundary_check>` tag.

#### 5.4.4 Phase detection heuristic (investigating → reporting)

When phase is `"investigating"` and student messages CEO, use a simple heuristic to decide if they're reporting vs. just asking:

- If the message is ≥ 40 words, treat as a report
- If the message contains phrases like "I found", "they told me", "according to", "the Operations Director said", treat as a report
- Otherwise, CEO responds with a brief reminder of the current mission and redirects back

This avoids a round-trip LLM call for phase detection.

### 5.5 `agents/sub_agents.py`

No changes to the routing logic. The CEO uses a new prompt template (`ceo_orchestrator_prompt.txt`) that is loaded when `mission_state` is present and the role is CEO. Add a branch in `_load_prompt_template()`:

```python
if role_type == "strategy" and mission_state:
    return (PROMPT_DIR / "ceo_orchestrator_prompt.txt").read_text(encoding="utf-8")
```

Sub-agents themselves get one new instruction appended to their system prompt:

```
You are operating in Mission {N}: {mission_title}.
The student has been assigned to collect specific information about: {focus_areas}.
Answer their questions directly. Share relevant facts from your allowed_info.
Do not evaluate whether their mission is complete — that is the CEO's job.
Do not ask follow-up questions unless it would help the student collect the specific 
information they need for this mission.
```

### 5.6 Sub-Agent Role-Playing Response Rules

These rules apply to every sub-agent system prompt (CFO, Operations Director, Customer Representative, Local Expert, and CEO when acting as an interviewee rather than orchestrator). They should be included as a standing instruction block in each agent's prompt template.

#### Core rules

1. **Answer first.** Always answer the student's question directly before adding anything else. A follow-up question is never a substitute for an answer.

2. **Response structure.** Every reply must include:
   - 1 direct answer from the stakeholder's perspective
   - 1–3 concrete case facts, numbers, or operational details (when available)
   - Optionally: 1 short follow-up question — only if permitted by Rule 3 below

3. **Follow-up questions are restricted.**

   **Constraint A — Permission condition** (controls *when* a follow-up is allowed):
   > A follow-up question is allowed only when it directly helps the student collect information required by the current mission's focus areas. Otherwise, end with a concrete next step or stop.

   **Constraint B — Default behavior** (controls *what to do when uncertain*):
   > Do NOT end your response with a question unless you have a specific, concrete reason why the student needs to hear it. If in doubt, skip the question.

   **Constraint C — Intent** (controls *what the question must accomplish*):
   > When a follow-up question is asked, it must advance the student toward completing the CEO-assigned mission. The sub-agent's question plays a guiding role — it should point the student toward what they still need to collect, not open a new topic or satisfy the agent's curiosity.

4. **Distinguish question types.**
   - If the student asks for factual information → provide the relevant case information directly.
   - If the student asks for a final recommendation or decision → do not give the full answer. Explain the stakeholder's position and identify what evidence or assumption the student should test.

5. **Stay within your information boundary.**

   | Role | Information scope |
   |------|-------------------|
   | CEO | Strategic rationale, market position, competitive pressure, high-level risks |
   | CFO | Investment costs, financial assumptions, NPV/ROI logic, tax rate, cost of capital, cost savings |
   | Operations Director | Supply chain complexity, SKUs, plants, distribution centers, inventory visibility, implementation feasibility |
   | Customer Representative | Availability, delivery time, product fit, switching behavior, contractor needs |
   | Local Expert | Local market differences, national sales office processes, employee resistance, standardization challenges |

6. **Use realistic management language.** Avoid overly dramatic, vague, or motivational phrasing (e.g., "transforming our operational narrative"). Prefer concrete language tied to the case.

7. **Facilitate, don't lecture.** The agent's role is to help the student uncover information — not to solve the case for them or deliver a comprehensive explanation unprompted.

#### Implementation note

Add the above rules as a `### How to respond` section at the end of each role prompt template (`cfo_prompt.txt`, `operations_prompt.txt`, `customer_prompt.txt`, `local_expert_prompt.txt`, and `ceo_prompt.txt` when CEO is in interviewee mode). The existing `allowed_info` / `locked_info` content governs WHAT the agent can say; these rules govern HOW the agent should structure and frame its response.

---

### 5.7 `agents/prompts/ceo_orchestrator_prompt.txt` (new file)

The CEO orchestrator prompt has three modes injected by the orchestrator:

**Mode: BRIEFING**
```
You are {name}, orchestrating a 5-mission investigation of this business case.

[Current Mission: {mission_index + 1} of 5 — {mission_title}]

The student needs to investigate: {focus_areas}

Your job in this message:
1. If Mission 1: briefly present the full investigation roadmap (5 mission titles only, 1 line each)
2. Give a specific briefing for the current mission: which agent(s) to visit, what to ask about
3. Use the following instruction verbatim as the mission assignment: {briefing_instruction}
4. End with: "Come back and tell me what you found."

Tone: direct, executive. 3-5 sentences max for the roadmap overview; 2-3 sentences for the mission assignment.
```

**Mode: EVALUATING**
```
You are {name}, evaluating whether Mission {mission_index + 1} is complete.

[Mission: {mission_title}]
[Completion criteria: {completion_criteria}]
[Assigned agents the student visited: {active_agents}]

The student just reported back. Their message is below.
You also have access to the recent conversation history with the sub-agents.

Evaluate their report against the completion criteria above.

If COMPLETE:
- Confirm what they got right (1-2 sentences)
- Briefly note anything they could have probed deeper (optional)
- Introduce the next mission assignment (use: {next_briefing_instruction})
- End your response with: <mission_verdict>COMPLETE</mission_verdict>

If INCOMPLETE:
- Be specific about what is missing (name the specific fact or concept)
- Redirect: "Go back to [agent] and ask specifically about [X]"
- End your response with: <mission_verdict>INCOMPLETE</mission_verdict>

Do not give the answer away. Do not reveal what the student should have found.
Tone: direct mentor, 3-5 sentences total. Never ask the student a question.
```

**Mode: REDIRECTING** (student messaged CEO during investigating phase but not reporting)
```
You are {name}. The student is currently on Mission {mission_index + 1}: {mission_title}.
They should be speaking with {active_agents}.

Briefly remind them of what they need to collect (1-2 sentences).
Tell them to come back once they have it.
Do not have a full conversation. Keep this to 2 sentences maximum.
```

---

## 6. Frontend Changes

### 6.1 `frontend/src/lib/api.ts`

Add `mission_state` to the session type:

```typescript
export interface MissionState {
  current_mission: number;
  phase: "briefing" | "investigating" | "evaluating" | "complete";
  active_agents: string[];
  missions_completed: number[];
  mission_reports: Record<string, string>;
}

// Add to ApiSession:
mission_state?: MissionState;
```

Also add `mission_state` to the `handle_message` response type (returned from `POST /sessions/{id}/messages`).

### 6.2 `frontend/src/app/student/session/[id]/page.tsx`

#### 6.2.1 State additions

```typescript
const [missionState, setMissionState] = useState<MissionState>({
  current_mission: 0,
  phase: "briefing",
  active_agents: ["CEO"],
  missions_completed: [],
  mission_reports: {},
});
```

Initialize from session load; update after every `handleSend()` response.

#### 6.2.2 Role panel: locked agents

Change `RoleItem` to accept an `isLocked` prop. When `isLocked`:
- Avatar is gray and 40% opacity
- No hover state
- Button is `disabled`
- Small "🔒" or lock icon overlaid on avatar
- `onSelect` is a no-op

Locking logic:
```typescript
function isAgentLocked(roleName: string, missionState: MissionState): boolean {
  return !missionState.active_agents.some(
    (a) => a.toLowerCase() === roleName.toLowerCase()
  );
}
```

CEO is never locked (always in `active_agents`).

#### 6.2.3 CEO visual distinction

In `RoleItem`, detect CEO role and add a small "ORCHESTRATOR" badge below the name, styled differently from regular agents (e.g., blue chip vs. gray).

#### 6.2.4 Mission panel (replaces right-side checklist)

Replace `SummaryPanel` with `MissionPanel`. It shows:

```
INVESTIGATION ROADMAP
─────────────────────
✓  M1  Diagnose operational bottlenecks   [Complete]
▶  M2  Understand customer impact          [Active]
○  M3  Quantify the financial case         [Locked]
○  M4  Examine implementation costs        [Locked]
○  M5  Evaluate downside risks             [Locked]

─────────────────────
CURRENT MISSION
Operations Director
─────────────────────
Focus:
• Fragmented information systems
• Inventory visibility
• SKU complexity
• Distribution flow

Status: Investigating
→ Report back to CEO when done
```

Mission states map to icons: `✓` complete, `▶` active, `○` locked.

The "CURRENT MISSION" section only shows when `phase !== "complete"`.

#### 6.2.5 "Report to CEO" CTA

When `missionState.phase === "investigating"` and `selectedRole !== "CEO"`, show a banner above the input area:

```
┌──────────────────────────────────────────────────┐
│ 📋 Mission in progress — when ready, go back to  │
│ CEO and report your findings.  [→ Report to CEO] │
└──────────────────────────────────────────────────┘
```

Clicking "Report to CEO" switches `selectedRole` to `"CEO"`.

#### 6.2.6 Remove old sufficiency check

The `hasSufficientEvidence()` check and "Ready to answer" badge are replaced by `missionState.phase === "complete"`. The "Proceed to Answer" button shows only when `phase === "complete"`.

---

## 7. What Does NOT Change

- The `POST /sessions/{id}/messages` endpoint signature stays the same.
- Evidence extraction from sub-agent replies continues running in the background.
- The sub-agent `allowed_info` / `locked_info` / unlock condition system is unchanged — it still governs what facts each agent can reveal.
- The answer page, submission flow, and scoring are unchanged.
- The professor upload and playbook generation are unchanged.

---

## 8. Implementation Order

1. **`agents/missions.py`** — define the 5 mission objects (no deps, can be done first)
2. **`schema.sql` + `database.py`** — add `mission_state` column and `update_mission_state()`
3. **`agents/prompts/ceo_orchestrator_prompt.txt`** — write the three-mode CEO prompt
4. **`agents/orchestrator.py`** — add access control + CEO routing + `handle_ceo_message()`
5. **`agents/sub_agents.py`** — add mission context block + response rules to sub-agent prompts
6. **`frontend/src/lib/api.ts`** — add `MissionState` types
7. **`frontend/src/app/student/session/[id]/page.tsx`** — replace checklist panel + lock agents + add CEO CTA

Each step is independently testable before the next.

---

## 9. Open Questions / Not In Scope

- **Mission definitions for non-ERP cases**: The 5 missions above are hardcoded for the current demo case. For future cases, missions would need to be generated by `playbook_generator.py` or stored in the `playbooks` table. This spec does not cover that — missions are defined in `agents/missions.py` for now.
- **Multi-agent missions (M4, M5)**: When two agents are active, the frontend unlocks both. The CEO evaluation must consider that the student may have talked to them in any order. The completion criteria handle this — CEO evaluates substance, not sequence.
- **Student skipping CEO**: If a student somehow routes directly to a locked agent (e.g., via URL manipulation), the backend access control at the orchestrator level is the safety net.
- **Streaming**: `handle_message_stream()` needs the same CEO routing logic. Defer to after the non-streaming path is working.
