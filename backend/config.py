from __future__ import annotations

import os

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in local unit tests
    load_dotenv = None

if load_dotenv:
    load_dotenv()

SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY: str | None = os.getenv("SUPABASE_SERVICE_KEY")

PROFESSOR_PASSCODE: str = os.getenv("PROFESSOR_PASSCODE", "prof-demo")
STUDENT_PASSCODE: str = os.getenv("STUDENT_PASSCODE", "student-demo")

# Set DEV_MODE=false to disable all developer-only routes and tooling.
DEV_MODE: bool = os.getenv("DEV_MODE", "true").lower() == "true"
