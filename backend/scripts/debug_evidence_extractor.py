"""Diagnostic: run _extract_evidence multiple times on the last OD reply
in a session, and check whether each candidate would be deduped against
the existing evidence board.

Usage:
    python scripts/debug_evidence_extractor.py <session_id> [role_name]

Defaults role_name to "Operations Director".
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import database as db
from agents.orchestrator import _extract_evidence
from database import _append_unique_evidence, _is_semantic_duplicate

RUNS = 3


async def main(session_id: str, role_name: str):
    session = db.get_session(session_id)
    if not session:
        print(f"Session not found: {session_id}")
        return

    messages = db.get_messages(session_id)
    od_msgs = [
        m for m in messages
        if m.get("role") == "agent" and m.get("agent_name") == role_name
    ]
    if not od_msgs:
        print(f"No messages from {role_name} found in session.")
        return

    last_reply = od_msgs[-1]["content"]
    print(f"=== Last {role_name} reply ===\n{last_reply}\n")

    current_board: list = list(session.get("evidence_board") or [])
    print(f"=== Current evidence board ({len(current_board)} items) ===")
    for e in current_board:
        print(f"  - [{e.get('source')}] {e.get('key_info')} (data: {e.get('data')})")
    print()

    for run in range(1, RUNS + 1):
        print(f"=== Extractor run {run}/{RUNS} ===")
        items = await _extract_evidence(last_reply, role_name, visible=True)
        if not items:
            print("  Extractor returned [] (empty)")
            print()
            continue

        for it in items:
            print(f"  + key_info: {it.get('key_info')}")
            print(f"    data:    {it.get('data')}")
            print(f"    risk:    {it.get('risk')}")

            # Check what _append_unique_evidence would do with this item
            dup_matches = [
                e for e in current_board
                if _is_semantic_duplicate(e, it)
            ]
            if dup_matches:
                print(f"    !! BLOCKED as semantic duplicate of:")
                for dm in dup_matches:
                    print(f"       - {dm.get('key_info')} (data: {dm.get('data')})")
            else:
                # Try the full append to see net effect
                new_board = _append_unique_evidence(current_board, [it])
                if len(new_board) == len(current_board):
                    print(f"    !! BLOCKED by other check (exact-key dedup or invalid key)")
                else:
                    print(f"    OK — would be added to board")
        print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/debug_evidence_extractor.py <session_id> [role_name]")
        sys.exit(1)
    sid = sys.argv[1]
    role = sys.argv[2] if len(sys.argv) >= 3 else "Operations Director"
    asyncio.run(main(sid, role))
