"""End-to-end flow test for the CaseIQ simulation.

Drives a full 5-mission session automatically using pre-scripted agent
interactions, then submits a reflection report.  Requires a running backend
and DEV_MODE=true.

Usage:
    python e2e_flow_test.py                          # auto-picks first available case
    python e2e_flow_test.py --case-id <uuid>         # use a specific case
    python e2e_flow_test.py --base-url http://...    # custom backend URL
    python e2e_flow_test.py --reset <session_id>     # reset an existing session and re-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import textwrap
from pathlib import Path

import httpx

# ── Terminal colours ─────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
CYAN   = "\033[96m"
MAGENTA = "\033[95m"
DIM    = "\033[2m"


def _banner(label: str, color: str = BLUE) -> None:
    width = 66
    print(f"\n{color}{BOLD}{'─' * width}{RESET}")
    print(f"{color}{BOLD}  {label}{RESET}")
    print(f"{color}{BOLD}{'─' * width}{RESET}")


def _speaker(name: str, text: str, color: str = RESET) -> None:
    wrapped = textwrap.fill(text, width=70, subsequent_indent="    ")
    print(f"\n{color}{BOLD}[{name}]{RESET}\n{wrapped}")


def _verdict(v: str) -> None:
    if v == "COMPLETE":
        print(f"\n  {GREEN}{BOLD}✓  VERDICT: COMPLETE{RESET}")
    else:
        print(f"\n  {RED}{BOLD}✗  VERDICT: INCOMPLETE{RESET}")


# ── HTTP helpers ──────────────────────────────────────────────────────────────

async def _post(client: httpx.AsyncClient, url: str, **kwargs) -> dict:
    resp = await client.post(url, **kwargs)
    if resp.status_code >= 400:
        raise RuntimeError(f"POST {url} → {resp.status_code}: {resp.text[:300]}")
    return resp.json()


async def _get(client: httpx.AsyncClient, url: str) -> dict | list:
    resp = await client.get(url)
    if resp.status_code >= 400:
        raise RuntimeError(f"GET {url} → {resp.status_code}: {resp.text[:300]}")
    return resp.json()


# ── Core flow ─────────────────────────────────────────────────────────────────

_AGENT_QUESTIONS = [
    "Please walk me through the key facts, figures, and risks I should know about for this decision.",
    "What are the most important specific numbers or data points I need to include in my report?",
]

_REPORT_PHRASES = [
    "reporting back",
    "my assessment",
    "based on my interviews",
    "I have completed",
    "here is my report",
]


def _build_report(mission_num: int, agent_responses: dict[str, list[str]]) -> str:
    """Combine raw agent replies into a CEO-facing report.

    Pastes the actual agent content so every figure in the report is directly
    traceable to a stakeholder — this is the safest strategy for passing the
    CEO's evidence check.
    """
    parts: list[str] = [f"Reporting back on Mission {mission_num}."]
    for agent, replies in agent_responses.items():
        combined = " ".join(r.strip() for r in replies if r.strip())
        # Use 1500 chars per agent so that both question rounds are fully included.
        # The key figures (e.g. 0.25% gross margin, 25% contractor segment) typically
        # appear in the second question's reply and were being cut off at 500 chars.
        excerpt = combined[:1500]
        if len(combined) > 1500:
            excerpt += "..."
        parts.append(f"From {agent}: {excerpt}")
    parts.append(
        "Based on these interviews I have documented the key risks and data points as requested."
    )
    return "  ".join(parts)


async def _interview_agents(
    client: httpx.AsyncClient,
    base: str,
    session_id: str,
    agents: list[str],
) -> dict[str, list[str]]:
    """Interview each agent with two questions; return their replies."""
    responses: dict[str, list[str]] = {}
    for agent in agents:
        _banner(f"INTERVIEWING  —  {agent}", BLUE)
        replies: list[str] = []
        for question in _AGENT_QUESTIONS:
            _speaker("You", question, DIM)
            data = await _post(
                client,
                f"{base}/sessions/{session_id}/messages",
                json={"role_name": agent, "message": question},
            )
            reply = data.get("reply", "")
            _speaker(agent, reply, CYAN)
            replies.append(reply)
        responses[agent] = replies
    return responses


async def _run_mission(
    client: httpx.AsyncClient,
    base: str,
    session_id: str,
    mission_num: int,
    all_agents: list[str],
    missions_done_before: int = 0,
    max_retries: int = 1,
) -> bool:
    """Run one mission cycle.  Returns True when the DB records a new completion.

    Completion is detected by comparing missions_done_before (passed in from the
    outer loop) against the updated DB count after each submission.  This avoids
    the counter-desync bug where script mission_num drifts ahead of the DB's
    current_mission after a forced skip.
    """

    _banner(f"MISSION {mission_num}  —  AWAITING BRIEFING", MAGENTA)

    # ── Step 1: Trigger CEO briefing ─────────────────────────────────────────
    kickoff = (
        "I'm ready to begin the investigation. Please assign my first mission."
        if mission_num == 1
        else "I'm ready for the next mission."
    )
    _speaker("You", kickoff, DIM)
    ceo_data = await _post(
        client,
        f"{base}/sessions/{session_id}/messages",
        json={"role_name": "CEO", "message": kickoff},
    )
    ceo_reply = ceo_data.get("reply", "")
    _speaker("CEO", ceo_reply, YELLOW)

    # Refresh session to pick up updated mission_state
    session = await _get(client, f"{base}/sessions/{session_id}")
    mission_state = session.get("mission_state") or {}

    if mission_state.get("phase") == "complete":
        return True  # All done

    # ── Step 2: Resolve which agents to interview ─────────────────────────────
    # Prefer agents named in the mission summary task over interviewing everyone.
    # This matches real user behaviour and avoids flooding the evidence board with
    # repeated identical facts from agents the CEO didn't assign.
    current_idx = mission_state.get("current_mission", 0)
    mission_task = (
        (mission_state.get("mission_summaries") or {})
        .get(str(current_idx), {})
        .get("task", "")
    )
    assigned_agents = [a for a in all_agents if a.lower() in mission_task.lower()]
    agents_to_interview = assigned_agents if assigned_agents else all_agents

    # ── Step 3: Interview assigned agents ────────────────────────────────────
    agent_responses = await _interview_agents(client, base, session_id, agents_to_interview)

    # ── Step 3: Submit report, retry if INCOMPLETE ───────────────────────────
    for attempt in range(1, max_retries + 1):
        _banner(f"MISSION {mission_num}  —  SUBMITTING REPORT  (attempt {attempt})", YELLOW)

        if attempt > 1:
            # Follow-up round: ask agents for more specific numbers
            print(f"{DIM}  Re-interviewing for more specific data...{RESET}")
            followup = "Please give me the exact figures and specific data points — percentages, dollar amounts, timelines."
            for agent in agents_to_interview:
                _speaker("You", followup, DIM)
                data = await _post(
                    client,
                    f"{base}/sessions/{session_id}/messages",
                    json={"role_name": agent, "message": followup},
                )
                extra_reply = data.get("reply", "")
                _speaker(agent, extra_reply, CYAN)
                agent_responses[agent].append(extra_reply)

        report = _build_report(mission_num, agent_responses)
        _speaker("You → CEO", report[:300] + ("..." if len(report) > 300 else ""), DIM)

        eval_data = await _post(
            client,
            f"{base}/sessions/{session_id}/messages",
            json={"role_name": "CEO", "message": report},
        )
        eval_reply = eval_data.get("reply", "")
        _speaker("CEO", eval_reply, YELLOW)

        # Relative completion check: did the DB record a new mission completion?
        # This is robust even when the script counter has drifted ahead of the DB.
        updated = await _get(client, f"{base}/sessions/{session_id}")
        updated_state = updated.get("mission_state") or {}
        missions_done_now = len(updated_state.get("missions_completed") or [])

        if missions_done_now > missions_done_before or updated_state.get("phase") == "complete":
            _verdict("COMPLETE")
            return True

        _verdict("INCOMPLETE")
        if attempt == max_retries:
            print(f"  {RED}Max retries reached for Mission {mission_num} — moving on.{RESET}")
            return False

    return False


async def run(base_url: str, case_id: str | None, reset_session_id: str | None) -> None:
    from agents.missions import MISSION_COUNT

    async with httpx.AsyncClient(timeout=180.0) as client:

        # ── Resolve case ID and playbook questions ────────────────────────────
        cases = await _get(client, f"{base_url}/dev/cases")
        if not cases:
            print(f"{RED}No cases found. Create a case first, then re-run.{RESET}")
            sys.exit(1)

        if not case_id:
            selected_case = cases[0]
            case_id = selected_case["id"]
            print(f"\n{DIM}Auto-selected case: {selected_case.get('title', case_id)}  ({case_id}){RESET}")
        else:
            selected_case = next((c for c in cases if c["id"] == case_id), None)
            if not selected_case:
                print(f"{RED}Case {case_id} not found or has no approved playbook.{RESET}")
                sys.exit(1)

        # Real question IDs from the playbook — used for the final submission.
        playbook_questions: list[dict] = selected_case.get("questions") or []

        # ── Create or reset session ───────────────────────────────────────────
        if reset_session_id:
            await _post(client, f"{base_url}/dev/sessions/{reset_session_id}/reset")
            session_id = reset_session_id
            print(f"\n{DIM}Reset session {session_id}{RESET}")
        else:
            session = await _post(
                client,
                f"{base_url}/sessions",
                json={"case_id": case_id, "student_id": "dev-tester"},
            )
            session_id = session["id"]

        _banner(f"E2E TEST STARTED  —  session {session_id}", CYAN)

        # Fetch playbook to get the full list of non-CEO roles
        session_data = await _get(client, f"{base_url}/sessions/{session_id}")
        # We rely on the cases endpoint to indirectly get roles later;
        # for now use defaults if needed — the orchestrator accepts any role name.
        # The /dev/cases endpoint returns published+draft but not the playbook roles.
        # Fall back to common role names; orchestrator will ignore unknown ones gracefully.
        _fallback_agents = ["Operations Director", "CFO", "Local Expert", "Customer Representative"]

        # ── Run all missions ──────────────────────────────────────────────────
        # Drive the loop from DB state, not a script counter, so a forced skip
        # never causes the detection logic to drift out of sync with the DB.
        attempts_without_progress = 0
        _MAX_STALLS = MISSION_COUNT  # give up after this many consecutive non-advances
        _MAX_MISSION_CYCLES = 3      # max outer-loop passes for one DB mission before skipping
        mission_cycle_count: dict[int, int] = {}

        while attempts_without_progress < _MAX_STALLS:
            current = await _get(client, f"{base_url}/sessions/{session_id}")
            state = current.get("mission_state") or {}

            if state.get("phase") == "complete":
                break

            missions_done_before = len(state.get("missions_completed") or [])
            # Display label: DB's 0-indexed current_mission → 1-indexed for humans
            display_num = int(state.get("current_mission", 0)) + 1

            mission_cycle_count[display_num] = mission_cycle_count.get(display_num, 0) + 1
            if mission_cycle_count[display_num] > _MAX_MISSION_CYCLES:
                print(f"  {RED}Mission {display_num} exceeded {_MAX_MISSION_CYCLES} cycles — stopping.{RESET}")
                break

            completed = await _run_mission(
                client, base_url, session_id, display_num, _fallback_agents,
                missions_done_before=missions_done_before,
            )

            if completed:
                attempts_without_progress = 0  # reset stall counter on any progress
                mission_cycle_count.pop(display_num, None)
            else:
                attempts_without_progress += 1

            # Final check after each mission attempt
            after = await _get(client, f"{base_url}/sessions/{session_id}")
            if (after.get("mission_state") or {}).get("phase") == "complete":
                break

        # ── Final reflection submission ───────────────────────────────────────
        _banner("FINAL REFLECTION SUBMISSION", MAGENTA)

        proceed_resp = await _post(client, f"{base_url}/sessions/{session_id}/proceed")
        print(f"  Status after proceed: {proceed_resp.get('status')}")

        reflection = (
            "Based on my investigation across all stakeholders, I recommend a controlled "
            "phased rollout rather than a full immediate implementation. The financial case "
            "depends heavily on inventory reduction assumptions that carry significant "
            "operational risk. Key risks identified include workforce absorption capacity, "
            "regional product availability constraints, and the gap between headquarters "
            "forecasts and ground-level operational realities. A phased approach with clear "
            "performance gates before each wave is the most defensible path forward."
        )

        # Build answers using real question IDs from the playbook.
        # Fall back to a synthetic entry only when no playbook questions are available.
        if playbook_questions:
            answers = [
                {"question_id": q["id"], "question_type": q.get("type", "decision"),
                 "answer": reflection, "cited_evidence": []}
                for q in playbook_questions
            ]
        else:
            answers = [{"question_id": "q1", "answer": reflection, "cited_evidence": []}]

        report_resp = await _post(
            client,
            f"{base_url}/sessions/{session_id}/submit",
            json={"answers": answers},
        )

        # ── Final summary ─────────────────────────────────────────────────────
        _banner("TEST COMPLETE  —  SUMMARY", GREEN)

        final = await _get(client, f"{base_url}/sessions/{session_id}")
        evidence_board = final.get("evidence_board") or []
        interviewed = final.get("interviewed_roles") or []
        mission_state = final.get("mission_state") or {}
        missions_done = len(mission_state.get("missions_completed") or [])

        print(f"\n  Session ID      : {session_id}")
        print(f"  Case ID         : {case_id}")
        print(f"  Status          : {final.get('status')}")
        print(f"  Missions done   : {missions_done} / {MISSION_COUNT}")
        print(f"  Mission phase   : {mission_state.get('phase')}")
        print(f"  Evidence items  : {len(evidence_board)}")
        print(f"  Roles visited   : {', '.join(interviewed) or 'none'}")

        score_data = report_resp if isinstance(report_resp, dict) else {}
        if score_data.get("total_score") is not None:
            print(f"  Final score     : {score_data['total_score']} / {score_data.get('total_max', 100)}")

        print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="CaseIQ e2e flow test")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend URL")
    parser.add_argument("--case-id", default=None, help="Case UUID to use (auto-selects first if omitted)")
    parser.add_argument("--reset", default=None, metavar="SESSION_ID", help="Reset an existing session and re-run it")
    args = parser.parse_args()

    # Ensure backend module path is resolvable when run as a script
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    asyncio.run(run(args.base_url, args.case_id, args.reset))


if __name__ == "__main__":
    main()
