# BizSimAI Frontend

Next.js 14 App Router frontend for the BizSimAI business-school simulation.

For full-stack setup, database setup, backend environment variables, and the complete API reference, use the root [`README.md`](../README.md). This file only covers frontend-specific development notes.

## Setup

Install dependencies from this directory:

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_PROFESSOR_PASSCODE=prof-demo
NEXT_PUBLIC_STUDENT_PASSCODE=student-demo
```

Start the frontend development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

To run the whole app, prefer the root startup script:

```bash
cd ..
./start.sh
```

## Frontend Scope

The frontend currently includes:

- Student registration and login.
- Student dashboard, progress, and debrief report views.
- Case detail page with start/continue/resume behavior.
- Mission-based interview screen with role locking from `mission_state.active_agents`.
- Evidence board and checklist progress synced from the backend.
- Final answer page with evidence citation.
- Scored report page rendered from `/sessions/{session_id}/report`.
- Professor dashboard, case creation, file parsing, playbook review, editing, approval, and analytics views.

## App Structure

```text
src/app/
├── dashboard/
│   ├── professor/          Professor dashboard, analytics, and case management
│   └── student/            Student dashboard, progress, and reports
├── professor/cases/        Case creation, edit, and playbook review pages
├── student/case/           Student case detail page
├── student/session/        Interview, answer, and report pages
├── login/                  Login screen
└── register/               Registration screen

src/components/
├── dashboard/              Shared dashboard layout and UI helpers
├── RoleChip.tsx            Stakeholder role display
└── InfoLayersTab.tsx       Playbook information-layer editor

src/lib/
├── api.ts                  Typed backend API client
└── auth.ts                 Local auth/passcode helpers
```

## Backend Contract Used

The typed frontend client lives in `src/lib/api.ts`. The most important calls are:

```text
GET    /cases
GET    /cases/{case_id}
GET    /cases/{case_id}/stats
POST   /cases
PATCH  /cases/{case_id}
DELETE /cases/{case_id}
POST   /cases/parse-file
POST   /cases/parse-excel
GET    /cases/{case_id}/playbook/pending
POST   /cases/{case_id}/playbook/{playbook_id}/approve
POST   /cases/{case_id}/playbook/{playbook_id}/reject
PATCH  /cases/{case_id}/playbook/{playbook_id}/content
PATCH  /cases/{case_id}/playbook/{playbook_id}/info-atoms

GET    /assignments/by-student/{student_id}

POST   /sessions
GET    /sessions/by-student/{student_id}
GET    /sessions/{session_id}
GET    /sessions/{session_id}/messages
POST   /sessions/{session_id}/messages
GET    /sessions/{session_id}/evidence
POST   /sessions/{session_id}/proceed
POST   /sessions/{session_id}/submit
GET    /sessions/{session_id}/report
```

The interview page reads `mission_state` from the session/message responses. Students can proceed to final answers once the mission phase is `complete`.

The final answer page submits to `/sessions/{session_id}/submit`, which saves answers, generates scores, and returns the debrief report.

## Verification

```bash
npm run lint
npm run build
```

Known npm note: `npm audit` may report vulnerabilities from the Next.js dependency tree. Review breaking changes before running `npm audit fix --force`.
