import os
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]

# Google AI Studio OpenAI-compatible endpoint; override via MODEL_BASE_URL for other providers
MODEL_BASE_URL: str = os.getenv(
    "MODEL_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
)
MODEL_API_KEY: str = os.environ["GEMMA_API_KEY"]
MODEL_NAME: str = os.getenv("GEMMA_MODEL", "gemma-2.0-flash")

llm_client = AsyncOpenAI(base_url=MODEL_BASE_URL, api_key=MODEL_API_KEY)

PROFESSOR_PASSCODE: str = os.getenv("PROFESSOR_PASSCODE", "prof-demo")
STUDENT_PASSCODE: str = os.getenv("STUDENT_PASSCODE", "student-demo")
