# Hi case — Database Schema

Supabase (PostgreSQL) schema and demo seed data for the CaseIQ platform.

## Tables


| Table              | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `cases`            | Case library uploaded by professors                                 |
| `playbooks`        | AI-generated simulation scripts (roles, questions, scoring rubrics) |
| `case_assignments` | Professor assigns a case to a student                               |
| `sessions`         | Student interview sessions (tracks evidence board & progress)       |
| `messages`         | Conversation history between student and agents                     |
| `submissions`      | Student answers per question                                        |
| `reports`          | Scoring reports (dimension scores, path replay, blind spots)        |


## Setup

### Prerequisites

- A [Supabase](https://supabase.com) project
- Project URL and service key from **Project Settings → API**

### 1. Create the tables

If you need to rebuild the schema from scratch, run `schema.sql` in the **Supabase SQL Editor**:

1. Go to your Supabase project → **SQL Editor**
2. Open `schema.sql` and paste the full contents
3. Click **Run**

> Skip this step if the tables already exist in your project.

### 2. Load demo data

Run `seeds.sql` in the SQL Editor the same way.

This inserts a published demo case (*Spotify India Market Entry*) with a complete playbook, roles, and scoring questions so you can test the full student flow immediately.

> `seeds.sql` clears all existing data before inserting. Do not run it in production.

### 3. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp backend.env.example .env
```

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
```

### 4. Verify the connection

```bash
python test_db.py
```

Expected output: `All tests passed. Database is working correctly.`

## JSONB field shapes

### `playbooks.roles`

```jsonc
[
  {
    "name": "CEO",
    "title": "Chief Executive Officer",
    "persona": "...",
    "focus_area": "Strategic vision & growth pressure",
    "allowed_info": ["fact visible from the start", ...],
    "locked_info":  ["fact hidden until unlock condition met", ...],
    "unlock_conditions": "Description of what the student must do to unlock"
  }
  // ... CFO, 运营负责人, 客户代表, 本地专家
]
```

### `playbooks.info_atoms`

```jsonc
[
  {
    "fact": "ARPU in India is $0.60 vs $5.20 globally",
    "owner_roles": ["CFO"],
    "access": "allowed"
  },
  {
    "fact": "Current India operation loses $18M annually",
    "owner_roles": ["CFO"],
    "access": "locked",
    "unlock_condition": "Student asks about profitability or loss figures"
  }
]
```

### `sessions.evidence_board`

```jsonc
[
  {
    "source": "CFO",
    "key_info": "ARPU is $0.60 vs $5.20 globally",
    "data": "Raw quote or extracted number",
    "risk": "Revenue per user too low to cover licensing costs"
  }
]
```

### `reports.scores`

```jsonc
[
  {
    "question_id": "q1",
    "question_type": "decision",
    "dimension_scores": [
      {"name": "Decision clarity", "score": 8, "max_score": 10, "comment": "..."}
    ],
    "question_total": 8,
    "question_max": 10,
    "feedback": "..."
  }
]
```

