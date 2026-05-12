# CaseIQ Frontend

Next.js 14 App Router frontend for the CaseIQ business-school simulation.

## Current Status

The frontend is connected to the validated Agent backend:

- Student registration/login flow is available.
- Student dashboard can load cases from FastAPI.
- Case detail page can start or continue a session.
- Student interview screen can send stakeholder questions to the backend.
- Backend responses from Gemma-powered Agents render in the chat UI.
- Evidence board refreshes from `/sessions/{id}/evidence` after every turn.
- Stable Agent role types are supported while preserving case-specific display names.

Validated locally:

```text
Frontend -> FastAPI -> Supabase -> Agent Orchestrator -> Gemma -> Evidence Board -> Frontend
```

## Setup

Install dependencies:

```bash
cd frontend
npm install
```

Create `.env.local` if needed:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PROFESSOR_PASSCODE=prof-demo
NEXT_PUBLIC_STUDENT_PASSCODE=student-demo
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local Full-Stack Run

Terminal 1:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload
```

Terminal 2:

```bash
cd frontend
npm run dev
```

## Interview Flow

1. Register or log in as a student.
2. Open the student dashboard.
3. Select a published case.
4. Start or continue an interview session.
5. Interview stakeholders.
6. Confirm evidence board updates after each answer.
7. Proceed when the backend returns `info_sufficient: true`.

## Backend Contract Used

```text
GET  /cases
GET  /cases/{case_id}
POST /sessions
GET  /sessions/{session_id}
GET  /sessions/{session_id}/messages
POST /sessions/{session_id}/messages
GET  /sessions/{session_id}/evidence
POST /sessions/{session_id}/proceed
```

The session page sends `role.role_type` when available, otherwise it falls back to the case-specific role name. After each message, it fetches `/sessions/{id}/evidence` so the UI reflects the backend's deduplicated evidence board.

## Verification

```bash
npm run lint
npm run build
```

Known npm note:

- `npm audit` currently reports dependency vulnerabilities from the Next.js dependency tree. Do not run `npm audit fix --force` without reviewing breaking changes.
