# AI Business Simulator (CaseIQ)

An AI-powered business simulation platform for business school education.

## What It Does

AI Business Simulator transforms existing course materials into interactive business decision simulations. Professors upload cases, prompts, financial tables, and rubrics; the platform generates a reviewable simulation playbook with stakeholder agents, information boundaries, mission tasks, final questions, and scoring rubrics.

Students do not receive a complete case upfront. They interview AI stakeholders, uncover evidence, complete CEO-assigned missions, submit final answers, and receive a scored debrief report.

## Current Status

The local full-stack flow is working end to end:

```text
Student/professor frontend
-> FastAPI backend
-> Supabase case/session/playbook state
-> Agent orchestrator
-> Gemma/Gemini-compatible model call
-> stakeholder reply
-> evidence extraction and mission tracking
-> answer submission
-> scored debrief report
```

Validated locally:

- Student dashboard loads assigned and published cases from FastAPI.
- Student sessions can interview stakeholders, collect evidence, and advance through mission states.
- CEO-driven mission flow tracks active agents, completed missions, and final readiness.
- Evidence board refreshes after each interview turn from the backend source of truth.
- Final answer submission produces a scored report with dimension scores, path replay, and blind-spot feedback.
- Professor flow can parse text/PDF/Excel materials, generate a playbook, edit/review it, and publish a case.
- Stable role types work across case-specific names, for example `City Official` and `Local Expert` both map to `local_regulatory`.

## Quick Start

Prerequisites:

- Python 3.11+
- Node.js 18+
- npm
- A Supabase project
- A Google AI Studio API key, or another OpenAI-compatible model endpoint

Create the database tables in Supabase first:

```text
schema.sql
seeds.sql
```

`seeds.sql` inserts a published demo case, but it clears existing data first. Do not run it against production data.

Copy and fill the environment files:

```bash
cp backend.env.example backend/.env
cp frontend.env.local.example frontend/.env.local
```

Start both servers from the repository root:

```bash
./start.sh
```

The script creates the backend virtual environment if needed, installs backend/frontend dependencies, and starts:

```text
Backend:  http://localhost:8000
Frontend: http://localhost:3000
API docs: http://localhost:8000/docs
```

If `./start.sh` is not executable on your machine, run:

```bash
chmod +x start.sh
./start.sh
```

## Manual Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --reload
```

Backend environment variables live in `backend/.env`:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>

GEMMA_API_KEY=<your-google-ai-studio-key>
GEMMA_MODEL=gemma-4-26b-a4b-it

PROFESSOR_PASSCODE=prof-demo
STUDENT_PASSCODE=student-demo
DEV_MODE=true
```

Supported model aliases:

```env
GEMINI_API_KEY=<your-google-ai-studio-key>
GOOGLE_API_KEY=<your-google-ai-studio-key>
GEMINI_MODEL=gemma-4-31b-it
MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
MODEL_TEMPERATURE=0.7
MODEL_MAX_TOKENS=1024
```

`DEV_MODE=true` mounts local testing endpoints under `/dev`. Set `DEV_MODE=false` outside local development.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend environment variables live in `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_PROFESSOR_PASSCODE=prof-demo
NEXT_PUBLIC_STUDENT_PASSCODE=student-demo
```

Open `http://localhost:3000`.

## How It Works

**For professors:**

1. Upload or paste case materials, including text, PDFs, and Excel financial tables.
2. The backend extracts content and generates a playbook with roles, info atoms, unlock conditions, checklist items, final questions, and scoring dimensions.
3. The professor reviews and edits roles, case background, teaching goals, questions, and information atoms.
4. The professor approves the playbook and publishes the case.

**For students:**

1. Register or log in with the student passcode.
2. Open a case and start or continue a session.
3. Talk to the CEO to receive the current mission.
4. Interview only the active stakeholders for that mission.
5. Report back to the CEO; the orchestrator evaluates whether the mission is complete.
6. Repeat until all missions are complete, then proceed to final answers.
7. Submit answers with cited evidence.
8. Review the generated debrief report and score breakdown.

## Core Agent Types

The product uses stable role types internally while each case can display realistic stakeholder names.

| Role type | Example names | Role | Key tension |
|---|---|---|---|
| `strategy` | CEO, Founder, General Manager | Growth-focused sponsor | May downplay execution costs and local complexity |
| `finance` | CFO, Finance Director | Financial gatekeeper | Holds runway, unit economics, and investment constraints |
| `operations` | Head of Operations, VP Ops | Execution realist | Surfaces staffing, launch, supply chain, and maintenance risks |
| `local_regulatory` | Local Expert, City Official, Regulator | Local and policy stakeholder | Knows regulation, market access, and local complexity |
| `customer_market` | Customer Rep, Rider, User Representative | Target user voice | Reveals willingness to pay, switching friction, and behavior gaps |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router, React 18, TypeScript |
| Backend | FastAPI, Python |
| AI model access | OpenAI-compatible client for Google AI Studio / Gemma / Gemini |
| Database | Supabase PostgreSQL |
| File parsing | pdfplumber, openpyxl, xlrd |

## Project Structure

```text
.
├── backend/
│   ├── main.py                    FastAPI app entry point
│   ├── config.py                  Supabase, passcode, and dev-mode config
│   ├── database.py                Supabase read/write operations
│   ├── llm_client.py              Model client, key rotation, streaming helpers
│   ├── requirements.txt
│   ├── agents/
│   │   ├── orchestrator.py        Mission flow, unlocks, evidence, routing
│   │   ├── playbook_generator.py  Professor-upload playbook generation
│   │   ├── scorer.py              Final answer scoring
│   │   ├── sub_agents.py          Role prompt builder and LLM call
│   │   └── role_types.py          Stable role mapping
│   ├── routers/
│   │   ├── assignments.py         Assignment lookup endpoints
│   │   ├── cases.py               Case, upload parsing, playbook review endpoints
│   │   ├── dev.py                 Local-only testing endpoints
│   │   └── sessions.py            Session, message, evidence, report endpoints
│   └── tests/
├── frontend/
│   ├── src/app/student/           Student case, session, answer, report screens
│   ├── src/app/professor/         Professor case creation and review screens
│   ├── src/app/dashboard/         Student/professor dashboards
│   ├── src/components/            Shared UI components
│   └── src/lib/api.ts             Backend API client
├── schema.sql                     Supabase database schema
├── seeds.sql                      Demo seed data
├── start.sh                       Local full-stack startup script
├── backend.env.example            Backend environment template
└── frontend.env.local.example     Frontend environment template
```

## API Endpoints

### Cases and Professor Flow

| Endpoint | Method | Description |
|---|---|---|
| `/cases` | GET | List cases; defaults to published only |
| `/cases` | POST | Create a case and generate a playbook |
| `/cases/{case_id}` | GET | Get case plus approved/pending playbook |
| `/cases/{case_id}` | PATCH | Update case metadata |
| `/cases/{case_id}` | DELETE | Delete a case |
| `/cases/{case_id}/stats` | GET | Get professor dashboard stats |
| `/cases/parse-file` | POST | Extract text from `.txt`, `.md`, or `.pdf` |
| `/cases/parse-excel` | POST | Extract tables from `.xlsx` or `.xls` |
| `/cases/{case_id}/playbook/pending` | GET | Fetch pending playbook for review |
| `/cases/{case_id}/playbook/{playbook_id}/approve` | POST | Approve playbook and optionally publish case |
| `/cases/{case_id}/playbook/{playbook_id}/reject` | POST | Reject playbook with notes |
| `/cases/{case_id}/playbook/{playbook_id}/content` | PATCH | Update reviewed roles, questions, description, or teaching goals |
| `/cases/{case_id}/playbook/{playbook_id}/info-atoms` | PATCH | Update playbook information atoms |

### Sessions and Student Flow

| Endpoint | Method | Description |
|---|---|---|
| `/sessions` | POST | Create a student session |
| `/sessions/by-student/{student_id}` | GET | List sessions for one student |
| `/sessions/{session_id}` | GET | Get session status and mission state |
| `/sessions/{session_id}/messages` | GET | Fetch conversation history |
| `/sessions/{session_id}/messages` | POST | Send a student message to an agent |
| `/sessions/{session_id}/messages/stream` | POST | Stream agent response events with Server-Sent Events |
| `/sessions/{session_id}/evidence` | GET | Get evidence board and checklist progress |
| `/sessions/{session_id}/proceed` | POST | Move from interview mode to answering mode |
| `/sessions/{session_id}/submissions` | GET | Fetch saved answer rows |
| `/sessions/{session_id}/submissions` | POST | Save final answers without generating a scored report |
| `/sessions/{session_id}/submit` | POST | Save final answers, score them, and create a report |
| `/sessions/{session_id}/report` | GET | Fetch the scored debrief report |

### Assignments and Dev

| Endpoint | Method | Description |
|---|---|---|
| `/assignments/by-student/{student_id}` | GET | List case assignments for a student |
| `/dev/cases` | GET | Local-only list of cases with question IDs |
| `/dev/sessions/{session_id}/reset` | POST | Local-only session reset for e2e tests |

## Message and Mission Flow

Student messages are handled by the Agent orchestrator:

1. Load the session, case, playbook, mission state, and message history.
2. Route the message to the selected role by exact name or stable `role_type`.
3. Keep locked information out of sub-agent prompts until unlock conditions are satisfied.
4. Build allowed role context from base facts, unlocked facts, mission focus, and conversation history.
5. Call the model and filter hidden thought tags from the response.
6. Extract visible evidence and deduplicate it into the session evidence board.
7. Update checklist and mission state.
8. When the student reports back to the CEO, evaluate mission completion and either assign the next mission or mark all missions complete.

Final submission uses a 100-point report model:

- 60 points for completing all missions.
- 40 points for final reflection quality, scaled from rubric-based LLM scoring.

## Database Tables

| Table | Description |
|---|---|
| `cases` | Case library and professor-created case metadata |
| `playbooks` | Generated and reviewed simulation scripts |
| `case_assignments` | Professor-to-student case assignments |
| `sessions` | Student session state, evidence board, mission state, and status |
| `messages` | Conversation history between student and agents |
| `submissions` | Student final answer rows |
| `reports` | Scored debrief reports, dimension scores, path replay, and blind spots |

## Verification

Backend tests:

```bash
cd backend
source .venv/bin/activate
python -m pytest
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

Known npm note: `npm audit` may report vulnerabilities from the Next.js dependency tree. Review breaking changes before running `npm audit fix --force`.

## Roadmap Snapshot

| Area | Status |
|---|---|
| Demo case, role interviews, evidence board | Working locally |
| Mission-based interview flow | Working locally |
| Professor upload, parsing, playbook generation, review, publish | Working locally |
| Final answer submission and scored debrief report | Working locally |
| Streaming message endpoint | Backend endpoint available |
| Supabase Realtime assistant push | Future work |
| Word/PPT parsing | Future work |
| Production auth and deployment hardening | Future work |
