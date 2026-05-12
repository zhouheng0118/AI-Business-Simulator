from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import cases, sessions

app = FastAPI(title="CaseIQ Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router)
app.include_router(sessions.router)


@app.get("/health")
def health():
    return {"status": "ok"}
