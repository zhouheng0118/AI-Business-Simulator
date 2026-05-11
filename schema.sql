-- CaseIQ — Database Schema
-- Platform: Supabase (PostgreSQL)
-- Last updated: 2026-05-11

-- ─────────────────────────────────────────
-- 1. cases  case library
-- ─────────────────────────────────────────
CREATE TABLE cases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  raw_content    TEXT,
  file_url       TEXT,
  file_type      TEXT CHECK (file_type IN ('text','markdown','pdf')),
  teaching_goals TEXT[] DEFAULT '{}',
  case_type      TEXT CHECK (case_type IN ('decision','analysis','reflection')) DEFAULT 'decision',
  difficulty     TEXT CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
  status         TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 2. playbooks  AI-generated simulation scripts
-- ─────────────────────────────────────────
CREATE TABLE playbooks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL DEFAULT 1,
  roles          JSONB NOT NULL DEFAULT '[]',
  -- [{name, title, persona, focus_area, allowed_info[], locked_info[], unlock_conditions}]
  -- fixed 5 roles: CEO / CFO / Head of Operations / Customer Rep / Local Expert
  info_atoms     JSONB DEFAULT '[]',
  -- Step 2 info atom list (for professor audit)
  -- [{fact, owner_roles[], access('allowed'|'locked'), unlock_condition}]
  questions      JSONB NOT NULL DEFAULT '[]',
  -- [{id, type('decision'|'analysis'|'reflection'), text, rubric_dimensions:[{name,weight}]}]
  review_status  TEXT CHECK (review_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  review_notes   TEXT,
  reviewed_at    TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. case_assignments  professor assigns a case to a student
-- ─────────────────────────────────────────
CREATE TABLE case_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL,
  due_at      TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 4. sessions  student interview sessions
-- ─────────────────────────────────────────
CREATE TABLE sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES cases(id),
  student_id       TEXT NOT NULL,
  status           TEXT CHECK (status IN ('in_progress','answering','submitted','scored')) DEFAULT 'in_progress',
  evidence_board   JSONB DEFAULT '[]',
  -- [{source, key_info, data, risk}]
  interviewed_roles TEXT[] DEFAULT '{}',
  started_at       TIMESTAMPTZ DEFAULT now(),
  submitted_at     TIMESTAMPTZ
);

-- ─────────────────────────────────────────
-- 5. messages  conversation history
-- ─────────────────────────────────────────
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('student','agent','assistant')) NOT NULL,
  agent_name  TEXT,
  -- CEO / CFO / Head of Operations / Customer Rep / Local Expert
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 6. submissions  student answers, one row per question
-- ─────────────────────────────────────────
CREATE TABLE submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id           TEXT NOT NULL,
  question_type         TEXT CHECK (question_type IN ('decision','analysis','reflection')) NOT NULL,
  answer                TEXT NOT NULL DEFAULT '',
  cited_evidence        JSONB DEFAULT '[]',
  alternatives_excluded TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_submission_per_question UNIQUE (session_id, question_id)
);

-- ─────────────────────────────────────────
-- 7. reports  scoring reports
-- ─────────────────────────────────────────
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scores          JSONB NOT NULL DEFAULT '[]',
  -- [{question_id, question_type,
  --   dimension_scores:[{name,score,max_score,comment}],
  --   question_total, question_max, feedback}]
  total_score     NUMERIC(5,2),
  total_max       NUMERIC(5,2),
  interview_path  JSONB DEFAULT '{}',
  -- {roles_visited[], roles_missed[], key_info_captured[], key_info_missed[]}
  blind_spots     JSONB DEFAULT '[]',
  -- [{type:'unasked_question'|'evidence_bias', description}]
  overall_comment TEXT,
  generated_at    TIMESTAMPTZ DEFAULT now()
);
