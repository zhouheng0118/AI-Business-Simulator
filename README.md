# CaseIQ — AI Business Decision Simulation Platform

An AI-powered business simulation platform for business school education. Professors upload case materials; the platform generates an interactive simulation playbook. Students interview AI stakeholders under CEO direction, collect evidence, complete five sequential missions, and receive a scored debrief report.

---

## Table of Contents

- [CaseIQ — AI Business Decision Simulation Platform](#caseiq--ai-business-decision-simulation-platform)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Features](#features)
    - [Student](#student)
    - [Professor](#professor)
    - [AI Orchestrator](#ai-orchestrator)
  - [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Quick Start](#quick-start)
    - [Prerequisites](#prerequisites)
    - [1. Initialize the database](#1-initialize-the-database)
    - [2. Configure environment variables](#2-configure-environment-variables)
    - [3. Start both servers](#3-start-both-servers)
  - [Manual Setup](#manual-setup)
    - [Backend](#backend)
    - [Frontend](#frontend)
  - [Environment Variables](#environment-variables)
    - [`backend/.env`](#backendenv)
    - [`frontend/.env.local`](#frontendenvlocal)
  - [Project Structure](#project-structure)
  - [Agent Role Types](#agent-role-types)
  - [Mission Flow](#mission-flow)
  - [CEO Orchestration Modes](#ceo-orchestration-modes)
  - [Information Layering](#information-layering)
  - [Agent Guide Strategy](#agent-guide-strategy)
  - [Scoring](#scoring)
  - [Database Tables](#database-tables)
  - [API Reference](#api-reference)
    - [Cases and Professor Flow](#cases-and-professor-flow)
    - [Sessions and Student Flow](#sessions-and-student-flow)
    - [Assignments and Dev](#assignments-and-dev)
  - [Testing](#testing)
    - [Backend](#backend-1)
    - [Frontend](#frontend-1)
  - [Roadmap](#roadmap)
  - [License](#license)

---

## Overview

CaseIQ transforms traditional business school case teaching into interactive AI simulations.

**For professors**: Upload text, PDF, or Excel case materials. The platform extracts content and generates a complete playbook with stakeholder roles, information boundaries, mission tasks, final questions, and scoring dimensions. Professors review and edit the playbook before publishing.

**For students**: No complete case is provided upfront. The AI CEO assigns investigations one mission at a time — students may only interview the stakeholders activated for the current mission. After collecting evidence they report back to the CEO, who fact-checks their findings against what stakeholders actually said and either advances them to the next mission or sends them back to collect more. After all five missions are complete, students submit a final analysis with cited evidence and receive a scored debrief report.

---

## Features

### Student
- Register or log in with a student passcode
- View assigned cases on the dashboard
- Start or continue a learning session
- Talk to the CEO to receive a mission briefing and learn which stakeholders to interview
- Interview only the CEO-activated stakeholders for the current mission; attempting to contact an unassigned stakeholder returns a block message directing them back to the CEO
- Report findings back to the CEO; the CEO fact-checks the report against collected evidence and either marks the mission complete or sends the student back for more
- Cycle through five missions, then proceed to final answers
- Submit final answers with evidence citations
- Review a scored debrief report with dimension scores, path replay, and blind-spot analysis

### Professor
- Upload or paste case materials (`.txt` / `.md` / `.pdf` / `.xlsx` / `.xls`)
- Backend automatically extracts content and generates a simulation playbook
- Review and edit roles, case background, teaching goals, questions, and info atoms
- Approve the playbook and publish the case
- View per-case statistics on the professor dashboard

### AI Orchestrator
- Routes student messages to the correct sub-agent by role type
- Enforces mission-based access control — only CEO-assigned agents are reachable per mission
- Controls information release by unlock condition and difficulty level — locked facts never enter a prompt until conditions are met
- Runs a 6-priority guide strategy each turn to steer agent responses toward uncovered evidence, calculation challenges, and cross-role referrals
- Extracts structured evidence from agent replies and deduplicates it into the evidence board (runs in the background after the reply is returned)
- Evaluates mission completion and drives the multi-stage mission flow
- Supports streaming responses via Server-Sent Events

---

## Architecture

```
Student / Professor Frontend (Next.js)
              │
              ▼
        FastAPI Backend
              │
    ┌─────────┴──────────────────────┐
    │                                │
    ▼                                ▼
Supabase                     Agent Orchestrator
(cases / sessions /                  │
 playbooks / state)     ┌────────────┴────────────┐
                        │                         │
                        ▼                         ▼
                 Sub-Agent Calls          Playbook Generator
             (role-play + evidence    (professor upload →
                 extraction)           playbook generation)
                        │
                        ▼
               Gemini / Gemma Model
```

**Request flow for a student message**:

1. Load session, playbook, mission state, and message history
2. If the target is the CEO role → hand off to CEO Orchestrator (BRIEFING / EVALUATING / REDIRECTING)
3. Otherwise, check active agents list; block and redirect if the target is not yet assigned
4. Evaluate unlock conditions and difficulty level gates; build a prompt containing only unlocked information
5. Select a guide strategy (6-priority system) to append to the sub-agent prompt
6. Call the model; filter hidden thought tags
7. Return reply to the student immediately
8. In the background: extract evidence, deduplicate into the evidence board, evaluate checklist items

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+ |
| AI model | OpenAI-compatible client (Google AI Studio / Gemma / Gemini) |
| Database | Supabase PostgreSQL |
| File parsing | pdfplumber, openpyxl, xlrd |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm
- A Supabase project
- A Google AI Studio API key, or another OpenAI-compatible model endpoint

### 1. Initialize the database

Run the following files in Supabase in order:

```text
schema.sql   — creates all tables
seeds.sql    — loads demo case data (clears existing data; do not run against production)
```

### 2. Configure environment variables

```bash
cp backend.env.example backend/.env
cp frontend.env.local.example frontend/.env.local
```

Fill in both files as described in [Environment Variables](#environment-variables).

### 3. Start both servers

```bash
./start.sh
```

The script creates the backend virtual environment if needed, installs all dependencies, and starts:

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| Frontend | http://localhost:3000 |
| Swagger docs | http://localhost:8000/docs |

If the script is not executable:

```bash
chmod +x start.sh
./start.sh
```

---

## Manual Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

### `backend/.env`

```env
# Supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>

# Model — any of the following aliases are supported
GEMMA_API_KEY=<your-google-ai-studio-key>
GEMMA_MODEL=gemma-4-26b-a4b-it

GEMINI_API_KEY=<your-google-ai-studio-key>
GEMINI_MODEL=gemma-4-31b-it
GOOGLE_API_KEY=<your-google-ai-studio-key>
MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
MODEL_TEMPERATURE=0.7
MODEL_MAX_TOKENS=1024

# Access passcodes
PROFESSOR_PASSCODE=prof-demo
STUDENT_PASSCODE=student-demo

# Development mode — mounts /dev debug endpoints
DEV_MODE=true
```

> Set `DEV_MODE=false` in any environment outside local development.

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_PROFESSOR_PASSCODE=prof-demo
NEXT_PUBLIC_STUDENT_PASSCODE=student-demo
```

---

## Project Structure

```
.
├── backend/
│   ├── main.py                    FastAPI app entry point
│   ├── config.py                  Supabase, passcode, and dev-mode config
│   ├── database.py                Supabase read/write operations
│   ├── llm_client.py              Model client, key rotation, streaming helpers
│   ├── requirements.txt
│   ├── agents/
│   │   ├── orchestrator.py        Mission flow, CEO modes, access control, evidence, routing
│   │   ├── missions.py            Mission count and default mission state
│   │   ├── playbook_generator.py  Professor-upload → playbook generation
│   │   ├── scorer.py              Final answer scoring
│   │   ├── sub_agents.py          Role prompt builder and LLM call
│   │   └── role_types.py          Stable role type mapping
│   ├── routers/
│   │   ├── assignments.py         Assignment lookup endpoints
│   │   ├── cases.py               Case CRUD, file parsing, playbook review
│   │   ├── dev.py                 Local-only debug endpoints (loaded only when DEV_MODE=true)
│   │   └── sessions.py            Session, message, evidence, and report endpoints
│   └── tests/                     Backend test suite
├── frontend/
│   ├── src/app/student/           Student pages (case / session / answers / report)
│   ├── src/app/professor/         Professor pages (case creation and review)
│   ├── src/app/dashboard/         Student and professor dashboards
│   ├── src/components/            Shared UI components
│   └── src/lib/api.ts             Backend API client
├── docs/                          Design documents
├── schema.sql                     Supabase database schema
├── seeds.sql                      Demo seed data
├── start.sh                       One-command local startup script
├── backend.env.example            Backend environment variable template
└── frontend.env.local.example     Frontend environment variable template
```

---

## Agent Role Types

The system uses stable internal `role_type` values while each case can configure its own display names.

| role_type | Function | Example display names | Core tension |
|-----------|----------|-----------------------|--------------|
| `strategy` | Growth-focused strategic decision-maker / CEO | CEO, Founder, General Manager | May downplay execution costs and local complexity |
| `finance` | Financial gatekeeper | CFO, Finance Director | Holds runway, unit economics, and investment constraints |
| `operations` | Execution realist | Head of Operations, VP Ops | Surfaces staffing, supply chain, and launch risks |
| `local_regulatory` | Local and policy stakeholder | Local Expert, City Official, Regulator | Knows regulation, market access, and local complexity |
| `customer_market` | Target user voice | Customer Rep, Rider, User Representative | Reveals willingness to pay, switching friction, and behavior gaps |

The `strategy` role type doubles as the CEO orchestrator. Any role whose name or type resolves to `strategy` is handled by the CEO Orchestration path.

Routing rule: `role_type match → name/title alias match → fallback`

---

## Mission Flow

Each case runs five sequential missions (`MISSION_COUNT = 5`). A session starts in phase `briefing` and advances through the following states:

```
briefing → investigating → (repeat per mission) → complete
```

| Phase | What it means |
|-------|---------------|
| `briefing` | Student messages the CEO to receive the mission assignment |
| `investigating` | Student interviews CEO-activated stakeholders and collects evidence |
| `complete` | All five missions finished; student proceeds to final answers |

**Access control**: During `investigating`, only the agents explicitly activated by the CEO for the current mission are reachable. Messaging any other stakeholder returns a block: *"You haven't been assigned to speak with X yet. Return to [CEO] for your next mission."*

**Mission state** stored per session:

```json
{
  "current_mission": 0,
  "phase": "briefing",
  "active_agents": ["CEO"],
  "missions_completed": [],
  "mission_summaries": {}
}
```

---

## CEO Orchestration Modes

When a student messages the CEO, the orchestrator selects one of three modes based on the current phase and message content:

| Mode | Trigger | Behavior |
|------|---------|----------|
| `BRIEFING` | Phase is `briefing` | CEO decides what to investigate, names the stakeholder(s), and states a specific deliverable. Activates the assigned agents. |
| `EVALUATING` | Phase is `investigating` and the student's message looks like a report (≥ 40 words or contains report phrases such as "I found", "they told me", "according to") | CEO fact-checks the student's report against evidence actually collected from interviews. If complete, confirms findings and issues the next mission briefing (or congratulates if all five are done). If incomplete, names what is missing and which stakeholder to revisit. |
| `REDIRECTING` | Phase is `investigating` but message does not look like a report | CEO reminds the student of the current mission's deliverable and which stakeholder(s) to interview. |

The CEO never asks questions — it only directs and evaluates. Mission advancement only occurs when the CEO emits `<mission_verdict>COMPLETE</mission_verdict>` in its reply; a missing or malformed tag defaults to `INCOMPLETE` so the student cannot advance silently.

---

## Information Layering

Each info atom in a playbook has an `access` level and an optional difficulty level (1–3):

| Level | Prerequisite to unlock |
|-------|----------------------|
| L1 | None — available as soon as the student asks about the right topic |
| L2 | Student has interviewed at least one other role in this session |
| L3 | Student has interviewed at least two other roles in this session |

Locked atoms also carry an `unlock_condition` — a natural-language condition evaluated by the LLM each turn. An atom only unlocks when both the level gate and the condition are satisfied. Locked fact text is never placed in a sub-agent prompt before the atom unlocks.

---

## Agent Guide Strategy

After computing allowed information, the orchestrator selects a follow-up guide strategy to append to the sub-agent's prompt. Strategies are evaluated in priority order; the first applicable one wins:

| Priority | Mode | When it fires |
|----------|------|---------------|
| 1 | `validation` | The previous turn issued a `calculation_challenge` and the student's reply contains numbers |
| 2 | `unlock_probe` | A locked atom's level gate has passed but it is not yet on the evidence board and the student's message is not already heading toward it |
| 3 | `calculation_challenge` | A playbook-defined calculation challenge's required data is now on the evidence board and the challenge has not yet been issued |
| 4 | `checklist_probe` | There are uncompleted checklist items assigned to this role |
| 5 | `cross_role_referral` | Uncompleted checklist items point to other stakeholders whose domain overlaps with the student's current message |
| 6 | `deepen` | No higher-priority trigger — agent deepens the current topic |

Each guide strategy is recorded in `follow_up_history` per role so the same prompt is never repeated within a session.

---

## Scoring

Final submissions use a 100-point model:

| Dimension | Points | Description |
|-----------|--------|-------------|
| Mission completion | 60 | Completing all five missions |
| Final reflection quality | 40 | Rubric-based LLM scoring, scaled proportionally |

The generated debrief report includes:
- Per-dimension score breakdown
- Interview path replay
- Blind-spot feedback for unvisited stakeholders and missed evidence

---

## Database Tables

| Table | Description |
|-------|-------------|
| `cases` | Case library and professor-created case metadata |
| `playbooks` | Generated and reviewed simulation playbooks |
| `case_assignments` | Professor-to-student case assignments |
| `sessions` | Student session state, evidence board, mission state, follow-up history, and status |
| `messages` | Conversation history between student and agents |
| `submissions` | Student final answer rows |
| `reports` | Scored debrief reports, dimension scores, path replay, and blind spots |

---

## API Reference

### Cases and Professor Flow

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cases` | GET | List cases; defaults to published only |
| `/cases` | POST | Create a case and generate a playbook |
| `/cases/{case_id}` | GET | Get case plus approved/pending playbook |
| `/cases/{case_id}` | PATCH | Update case metadata |
| `/cases/{case_id}` | DELETE | Delete a case |
| `/cases/{case_id}/stats` | GET | Professor dashboard statistics |
| `/cases/parse-file` | POST | Extract text from `.txt`, `.md`, or `.pdf` |
| `/cases/parse-excel` | POST | Extract tables from `.xlsx` or `.xls` |
| `/cases/{case_id}/playbook/pending` | GET | Fetch the pending playbook for review |
| `/cases/{case_id}/playbook/{playbook_id}/approve` | POST | Approve playbook and optionally publish the case |
| `/cases/{case_id}/playbook/{playbook_id}/reject` | POST | Reject playbook with reviewer notes |
| `/cases/{case_id}/playbook/{playbook_id}/content` | PATCH | Update roles, questions, description, or teaching goals |
| `/cases/{case_id}/playbook/{playbook_id}/info-atoms` | PATCH | Update playbook information atoms |

### Sessions and Student Flow

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sessions` | POST | Create a student session |
| `/sessions/by-student/{student_id}` | GET | List sessions for one student |
| `/sessions/{session_id}` | GET | Get session status and mission state |
| `/sessions/{session_id}/messages` | GET | Fetch conversation history |
| `/sessions/{session_id}/messages` | POST | Send a student message to an agent |
| `/sessions/{session_id}/messages/stream` | POST | Stream agent response events via SSE |
| `/sessions/{session_id}/evidence` | GET | Get evidence board and checklist progress |
| `/sessions/{session_id}/proceed` | POST | Move from interview mode to answering mode |
| `/sessions/{session_id}/submissions` | GET | Fetch saved answer rows |
| `/sessions/{session_id}/submissions` | POST | Save final answers without scoring |
| `/sessions/{session_id}/submit` | POST | Save final answers, score them, and generate a report |
| `/sessions/{session_id}/report` | GET | Fetch the scored debrief report |

### Assignments and Dev

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/assignments/by-student/{student_id}` | GET | List case assignments for a student |
| `/dev/cases` | GET | Local-only: list cases with question IDs |
| `/dev/sessions/{session_id}/reset` | POST | Local-only: reset a session for end-to-end tests |

---

## Testing

### Backend

```bash
cd backend
source .venv/bin/activate
python -m pytest
```

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

> `npm audit` may report vulnerabilities from the Next.js dependency tree. Review breaking changes before running `npm audit fix --force`.

---

## Roadmap

| Area | Status |
|------|--------|
| Demo case, role interviews, evidence board | Working locally |
| Mission-based interview flow (5 missions, CEO orchestration) | Working locally |
| Professor upload, parsing, playbook generation, review, publish | Working locally |
| Final answer submission and scored debrief report | Working locally |
| Streaming message endpoint (SSE) | Backend endpoint available |
| Supabase Realtime push | Future work |
| Word / PowerPoint parsing | Future work |
| Production auth and deployment hardening | Future work |

---

## License

See [LICENSE](LICENSE).
