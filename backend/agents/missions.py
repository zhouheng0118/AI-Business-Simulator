from __future__ import annotations

MISSIONS: list[dict] = [
    {
        "index": 0,
        "title": "Diagnose current operational bottlenecks",
        "active_agents": ["Operations Director"],
        "focus_areas": [
            "Fragmented information systems across locations",
            "Inventory visibility and accuracy",
            "SKU complexity and product mix",
            "Distribution flow and fulfillment process",
        ],
        "completion_criteria": (
            "Student has identified at least 2 specific operational bottlenecks "
            "AND can explain why fragmented systems are their root cause."
        ),
        "briefing_instruction": (
            "Go speak with the Operations Director. Ask specifically about: "
            "the current state of their information systems, inventory visibility problems, "
            "SKU complexity, and how products flow through distribution. "
            "Come back and tell me what the 2-3 biggest operational bottlenecks are."
        ),
    },
    {
        "index": 1,
        "title": "Understand customer and market impact",
        "active_agents": ["Customer Representative"],
        "focus_areas": [
            "Product availability and stockout frequency",
            "Delivery lead time to contractors",
            "Contractor ordering requirements",
            "Customer switching risk and loyalty drivers",
        ],
        "completion_criteria": (
            "Student understands how current operational problems affect customers "
            "AND can articulate the risk of customer attrition if problems continue."
        ),
        "briefing_instruction": (
            "Now speak with our Customer Representative. Find out: "
            "how often products are unavailable, what contractors need in terms of delivery time, "
            "and how likely they are to switch to a competitor if service doesn't improve."
        ),
    },
    {
        "index": 2,
        "title": "Quantify the financial case",
        "active_agents": ["CFO"],
        "focus_areas": [
            "Capital expenditure for ERP implementation",
            "Software license costs (ongoing)",
            "Expected benefits: inventory reduction, margin improvement",
            "Discount rate and tax rate for NPV calculation",
        ],
        "completion_criteria": (
            "Student can articulate the key cost and benefit line items for the ERP investment "
            "AND understands the financial parameters needed to evaluate the business case."
        ),
        "briefing_instruction": (
            "Visit the CFO. You need to understand the full financial case: "
            "what it costs to implement the ERP system, what the ongoing costs are, "
            "and what financial benefits we expect — especially inventory reduction and margin improvement. "
            "Also find out what discount rate and tax rate to use for any NPV analysis."
        ),
    },
    {
        "index": 3,
        "title": "Examine implementation costs and constraints",
        "active_agents": ["CFO", "Operations Director"],
        "focus_areas": [
            "Implementation team: employees and consultants required",
            "Dedicated task force requirements",
            "Ongoing system maintenance costs",
            "Wave implementation structure and timeline constraints",
        ],
        "completion_criteria": (
            "Student understands the total people-cost of implementation "
            "AND knows why a phased/wave approach is required."
        ),
        "briefing_instruction": (
            "You need to go back to the CFO and Operations Director — both of them. "
            "Ask specifically about: how many people are needed to implement this system, "
            "whether we need outside consultants, what a dedicated task force looks like, "
            "and why the implementation has to be phased in waves rather than all at once."
        ),
    },
    {
        "index": 4,
        "title": "Evaluate downside risks and final decision assumptions",
        "active_agents": ["Local Expert", "CFO", "Operations Director"],
        "focus_areas": [
            "Off-the-shelf ERP fit vs. custom configuration risk",
            "Process change and employee resistance",
            "Implementation failure risk",
            "Sensitivity of NPV to key financial assumptions",
        ],
        "completion_criteria": (
            "Student has identified at least 2 specific downside risks "
            "AND can explain which financial assumptions most affect whether the investment is justified."
        ),
        "briefing_instruction": (
            "Final mission. Talk to the Local Expert, CFO, and Operations Director about risks. "
            "Specifically: how well does an off-the-shelf ERP fit our processes, "
            "what happens if employees resist the change, "
            "and which of our financial assumptions — cost, benefits, timeline — "
            "would most change the investment decision if they turned out to be wrong."
        ),
    },
]

DEFAULT_MISSION_STATE: dict = {
    "current_mission": 0,
    "phase": "briefing",
    "active_agents": ["CEO"],
    "missions_completed": [],
    "mission_reports": {},
}
