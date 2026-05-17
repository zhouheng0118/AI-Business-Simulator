from __future__ import annotations

MISSION_COUNT = 5

DEFAULT_MISSION_STATE: dict = {
    "current_mission": 0,
    "phase": "briefing",
    "active_agents": ["CEO"],
    "missions_completed": [],
    "mission_reports": {},
    "mission_summaries": {},
}
