# AI Business Simulator (CaseIQ)

An AI-powered business simulation platform for business school education.

## What It Does

AI Business Simulator transforms existing course materials into interactive business decision simulations. Professors upload their cases, slides, assignments, and rubrics — the platform automatically generates a structured simulation where students must act as real managers rather than passive readers.

Instead of reading a complete case study and writing an analysis, students navigate incomplete information, interview AI stakeholders, uncover hidden data, and make business decisions under uncertainty.

## The Problem It Solves

Traditional case studies hand students a complete picture upfront. Real business decisions don't work that way — managers face conflicting information, partial data, competing stakeholder interests, and time pressure. This gap between classroom analysis and real decision-making is what AI Business Simulator is designed to close.

At the same time, generative AI has made it trivial to produce a polished case analysis in minutes. What AI cannot easily replicate is the *process* of a good decision: knowing which questions to ask, whose account to trust, which risks to weigh, and how to reason under uncertainty. This platform shifts assessment from the final report to the decision process itself.

## How It Works

**For professors:**
1. Upload existing course materials — case PDFs, slides, assignment prompts, financial data, grading rubrics.
2. The system's orchestrating Agent parses the materials and generates a simulation playbook: student role, company background, task objective, stakeholder agents, hidden information, evidence points, and scoring rubric.
3. The professor reviews and confirms the generated setup before students begin.

**For students:**
1. Enter the simulation and read the initial company background and task.
2. Choose which AI stakeholder agents to interview — CEO, CFO, Operations Manager, Local Market Expert, Customer Representative.
3. Ask questions in natural language. A master Agent controls information release: each stakeholder answers only within their role and knowledge boundary, and some critical information only surfaces when students ask the right questions.
4. A Student Assistant tracks an Evidence Board — logging what has been discovered, from which source, and what risks it implies.
5. When enough evidence is gathered, submit a final decision memo responding to the case questions with supporting evidence, risk assessment, and reflection.
6. Receive a personalized debrief report scored against the professor's rubric, covering what evidence was used, what was overlooked, and how the reasoning process held up.

## Core Agents (MVP)

| Agent | Role | Key tension |
|---|---|---|
| CEO | Growth-focused executive | May downplay execution costs and local complexity |
| CFO | Financial gatekeeper | Holds critical cash runway data; conservative on high-cost expansion |
| Operations Manager | Execution realist | Surfaces underestimated supply chain and staffing challenges |
| Local Market Expert | On-the-ground partner | Knows real rent and consumer preference gaps; has own incentives |
| Customer Representative | Target user voice | Reveals price sensitivity and taste preference differences |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Vercel |
| Agent Backend | FastAPI (Python), Railway / Fly.io |
| AI Model | Gemma 4 (Google AI Studio, OpenAI-compatible endpoint) |
| Database & Storage | Supabase (PostgreSQL) |

## Project Structure

```
├── backend/                  Agent backend (FastAPI)
│   ├── main.py               FastAPI app entry point
│   ├── config.py             Model and Supabase config
│   ├── database.py           All Supabase read/write operations
│   ├── requirements.txt
│   ├── agents/
│   │   ├── orchestrator.py   4-step main message flow
│   │   └── sub_agents.py     Role prompt builder + LLM call
│   └── routers/
│       ├── cases.py          GET /cases, GET /cases/{id}
│       └── sessions.py       Session and message endpoints
├── schema.sql                Supabase database schema
├── seeds.sql                 Demo case seed data (Spotify India)
├── backend.env.example       Backend environment variable template
└── frontend.env.local.example  Frontend environment variable template
```

## Backend Setup

### Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com/app/apikey) API key (for Gemma)

### 1. Create the database tables

In your Supabase project → **SQL Editor**, run `schema.sql`, then `seeds.sql`.

`seeds.sql` inserts a published demo case (*Spotify India Market Entry*) with a complete playbook so you can test the full student interview flow immediately.

> `seeds.sql` clears all existing data before inserting. Do not run it in production.

### 2. Install dependencies

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp ../backend.env.example .env
```

Fill in your credentials:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
GEMMA_API_KEY=<your-google-ai-studio-key>
GEMMA_MODEL=gemma-4-26b-a4b-it
```

To use a different model provider, set `MODEL_BASE_URL` to any OpenAI-compatible endpoint.

### 4. Start the server

```bash
python -m uvicorn main:app --reload
```

API docs available at `http://localhost:8000/docs`.

## API Endpoints (P1)

| Endpoint | Method | Description |
|---|---|---|
| `/cases` | GET | List published cases |
| `/cases/{id}` | GET | Get case + playbook |
| `/sessions` | POST | Create a student session |
| `/sessions/{id}` | GET | Get session status and evidence board |
| `/sessions/{id}/messages` | POST | Send message → triggers 4-step orchestrator |
| `/sessions/{id}/messages` | GET | Fetch conversation history |
| `/sessions/{id}/evidence` | GET | Get current evidence board |
| `/sessions/{id}/proceed` | POST | Advance session to answering phase |

## Message Flow (Orchestrator)

Every student message to an agent goes through four steps:

1. **Unlock evaluation** — LLM checks whether the student's message + history satisfies any locked information's unlock condition
2. **Build allowed_info** — base allowed facts + any newly unlocked facts for this turn
3. **Route to Sub-Agent** — inject controlled system prompt → call model → extract evidence → write to Supabase
4. **Sufficiency check** — if ≥3 roles interviewed and ≥3 evidence items collected, return `info_sufficient: true`

## Database Schema

| Table | Description |
|---|---|
| `cases` | Case library |
| `playbooks` | AI-generated simulation scripts (roles, questions, scoring rubrics) |
| `case_assignments` | Professor assigns a case to a student |
| `sessions` | Student interview sessions (tracks evidence board & progress) |
| `messages` | Conversation history between student and agents |
| `submissions` | Student answers per question |
| `reports` | Scoring reports (dimension scores, path replay, blind spots) |

## Implementation Roadmap

| Phase | Scope |
|---|---|
| **P1** | Hardcoded demo case + HTTP conversation flow (5 roles + info boundary) + Evidence Board |
| **P2** | Answer interface (3 question types + evidence citation) + per-question scoring + debrief report |
| **P3** | Professor upload + 3-step playbook generation + review interface + case assignment |
| **P4** | WebSocket streaming + Supabase Realtime student assistant push |
| **P5** | Student assistant agent tuning + Word/PPT parsing + multi-model UI |

---

*For architecture details see [Design.md](Design.md) (not committed to repo).*
