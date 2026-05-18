from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import assignments, cases, sessions
from config import DEV_MODE

app = FastAPI(title="CaseIQ Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assignments.router)
app.include_router(cases.router)
app.include_router(sessions.router)

# Developer channel — disable by setting DEV_MODE=false in .env
if DEV_MODE:
    from routers import dev
    app.include_router(dev.router)


@app.get("/health")
def health():
    return {"status": "ok"}
