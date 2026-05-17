from __future__ import annotations

import re
from pathlib import Path

from agents.role_types import infer_role_type
from llm_client import chat, stream_chat


PROMPT_DIR = Path(__file__).resolve().parent / "prompts"
ROLE_PROMPT_FILES = {
    "strategy": "ceo_prompt.txt",
    "finance": "cfo_prompt.txt",
    "operations": "operations_prompt.txt",
    "local_regulatory": "local_expert_prompt.txt",
    "customer_market": "customer_prompt.txt",
    "ceo": "ceo_prompt.txt",
    "cfo": "cfo_prompt.txt",
    "chief financial officer": "cfo_prompt.txt",
    "运营负责人": "operations_prompt.txt",
    "head of operations": "operations_prompt.txt",
    "operations manager": "operations_prompt.txt",
    "客户代表": "customer_prompt.txt",
    "customer rep": "customer_prompt.txt",
    "customer representative": "customer_prompt.txt",
    "本地专家": "local_expert_prompt.txt",
    "local expert": "local_expert_prompt.txt",
    "market consultant": "local_expert_prompt.txt",
}


def _prompt_file_for(role_name: str) -> Path:
    """Return the prompt template path for a role name or title."""
    return PROMPT_DIR / ROLE_PROMPT_FILES.get(role_name.lower(), "generic_prompt.txt")


def _load_prompt_template(role: dict, mission_state: dict | None = None) -> str:
    """Load the best matching role prompt template from agents/prompts."""
    role_type = infer_role_type(role)

    # CEO in mission orchestrator mode uses a dedicated prompt
    if role_type == "strategy" and mission_state:
        orchestrator_path = PROMPT_DIR / "ceo_orchestrator_prompt.txt"
        if orchestrator_path.exists():
            return orchestrator_path.read_text(encoding="utf-8")

    role_name = str(role.get("name", ""))
    title = str(role.get("title", ""))
    for value in (role_type, role_name, title):
        if not value:
            continue
        path = _prompt_file_for(value)
        if path.exists():
            return path.read_text(encoding="utf-8")

    return """You are {name}, {title} at the company in this business case study.

Your persona: {persona}
Your focus area: {focus_area}

[Information you CAN share in this conversation]
{allowed_info}

[Information you MUST NOT reveal - do not mention even indirectly]
{locked_info}

[Unlock condition summary]
{unlock_conditions}

Answer naturally and stay in character. Keep replies concise (2-4 sentences).
If asked about something outside your domain, redirect the student to the relevant person.
Do not volunteer locked information even if asked indirectly.

End your response with exactly this self-check line:
<boundary_check>NO</boundary_check>"""


def _build_guide_block(guide_context: dict, role: dict, session: dict) -> str:
    """Build the [GUIDE] prompt block from a resolved GuideContext."""
    mode = guide_context["mode"]
    role_name = role.get("name", "")

    if mode == "validation":
        data_lines = "\n".join(f"- {d}" for d in guide_context.get("available_data", []))
        mode_instructions = (
            "The student has provided a calculation or analytical result. Evaluate it using the data below.\n"
            "If the reasoning is directionally correct: affirm briefly, then push one level deeper.\n"
            "If the reasoning has a gap: probe the specific gap without giving the answer away.\n"
            f"Expected correct insight: {guide_context.get('expected_insight', '')}\n"
            f"Reference data:\n{data_lines}"
        )
    elif mode == "unlock_probe":
        mode_instructions = (
            "There is a deeper dimension to this topic the student hasn't reached yet.\n"
            "Ask a question that points them in the right direction without revealing the hidden content.\n"
            f"Hint direction (do NOT quote this directly): {guide_context.get('target_description', '')}"
        )
    elif mode == "calculation_challenge":
        data_lines = "\n".join(f"- {d}" for d in guide_context.get("available_data", []))
        mode_instructions = (
            f"Challenge the student to calculate: {guide_context.get('target_description', '')}\n"
            f"Formula approach: {guide_context.get('formula_hint', '')}\n"
            "In your follow-up, provide ALL of the following data — the student needs them to compute the answer:\n"
            f"{data_lines}\n"
            "Give the numbers naturally in character, then ask the student what they conclude."
        )
    elif mode == "checklist_probe":
        hints = "\n".join(f"- {h}" for h in guide_context.get("uncompleted_checklist_hints", []))
        mode_instructions = (
            "Guide the student toward this unexplored area (do NOT quote the label directly):\n"
            f"{hints}\n"
            "Ask a question that makes them want to investigate this."
        )
    elif mode == "cross_role_referral":
        target_roles = ", ".join(guide_context.get("target_roles", []))
        mode_instructions = (
            f"The most valuable next step for the student is to speak with: {target_roles}\n"
            "In character, suggest this and briefly explain why it matters for the current analysis.\n"
            "Make clear they can return to you afterward."
        )
    else:  # deepen
        mode_instructions = (
            "Ask a follow-up that pushes the student to think about implications, trade-offs, or next steps\n"
            "that follow naturally from what you just said."
        )

    history = (session.get("follow_up_history") or {}).get(role_name, [])
    if history:
        already_used = "\n".join(f"  - [{e['mode']}] {e['target']}" for e in history[-5:])
    else:
        already_used = "  (none yet)"

    return (
        f"\n\n---\n[GUIDE — MANDATORY FOLLOW-UP]\n"
        "After your main response, end with exactly ONE follow-up question. No preamble, no label.\n\n"
        f"Conversation stage: {guide_context.get('stage_description', '')}\n"
        f"Mode: {mode}\n\n"
        f"{mode_instructions}\n\n"
        "Rules:\n"
        f"- Speak entirely as {role_name} — no narrator voice, no meta-commentary\n"
        "- Maximum 2 sentences for the follow-up\n"
        "- Never reveal locked information in the follow-up question\n"
        "- Do not repeat any follow-up question you have already asked this student:\n"
        f"{already_used}"
    )


def _build_system_prompt(
    role: dict,
    allowed_info: list,
    raw_content: str = "",
    guide_context: dict | None = None,
    session: dict | None = None,
) -> str:
    """Build a role-specific system prompt with controlled information."""
    allowed_str = (
        "\n".join(f"- {info}" for info in allowed_info)
        if allowed_info
        else "(none)"
    )
    locked_count = len(role.get("locked_info", []) or [])
    locked_str = (
        f"({locked_count} locked fact(s) exist. Exact locked facts are withheld "
        "from this prompt until the orchestrator unlocks them.)"
        if locked_count
        else "(none)"
    )

    ms = (session or {}).get("mission_state") or None
    template = _load_prompt_template(role, mission_state=ms)
    prompt = template.format(
        name=role.get("name", ""),
        title=role.get("title", ""),
        persona=role.get("persona", ""),
        focus_area=role.get("focus_area", ""),
        allowed_info=allowed_str,
        locked_info=locked_str,
        unlock_conditions=role.get("unlock_conditions", ""),
    )

    if raw_content:
        prompt += (
            "\n\n[Case Reference Data — use to answer specific factual questions accurately]\n"
            + raw_content
        )

    prompt += "\n\nIMPORTANT: Keep your replies concise — 3 to 4 sentences maximum."

    mission_state = (session or {}).get("mission_state") or {}
    mission_active = bool(mission_state and mission_state.get("phase") not in (None, "complete"))

    # GUIDE block drives structured follow-up only in mission mode.
    # Outside mission mode the agent answers freely without a mandated follow-up.
    if guide_context and mission_active:
        prompt += _build_guide_block(guide_context, role, session or {})

    if mission_active:
        from agents.missions import MISSION_COUNT
        current_idx = int(mission_state.get("current_mission", 0))
        prompt += (
            f"\n\n[Mission Context]\n"
            f"You are operating in Mission {current_idx + 1} of {MISSION_COUNT}.\n"
            f"The student has been assigned by the CEO to investigate your domain.\n"
            "Answer their questions directly. Share relevant facts from your allowed_info.\n\n"
            "[How to respond]\n"
            "1. Answer first. A follow-up question is never a substitute for an answer.\n"
            "2. Include 1-3 concrete facts, numbers, or operational details when available.\n"
            "3. Closing signal: if the student has gathered the key facts from your domain and "
            "demonstrates they understand them (e.g. correctly summarises a metric, draws the "
            "right conclusion, or says they are ready to move on), affirm briefly and tell them: "
            "'You have what you need from me — go report your findings to the CEO.' "
            "When this happens, skip the follow-up question from [GUIDE] above.\n"
            "4. If asked for factual information: provide it directly. "
            "If asked for a final recommendation: explain your position and identify what "
            "evidence the student should test.\n"
            "5. Use realistic management language. No vague or motivational phrases.\n"
            "6. Help the student discover information — do not solve the case for them."
        )

    return prompt


def _strip_boundary_check(text: str) -> str:
    """Remove the internal boundary self-check marker before returning text."""
    return re.sub(
        r"\s*<boundary_check>.*?</boundary_check>",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()


def _message_belongs_to_role_thread(msg: dict, role_name: str) -> bool:
    """Return whether a stored message belongs to this stakeholder thread."""
    agent_name = msg.get("agent_name")
    return agent_name in {role_name, None, ""}


async def call_sub_agent(
    role: dict,
    allowed_info: list,
    history: list,
    student_message: str,
    raw_content: str = "",
    guide_context: dict | None = None,
    session: dict | None = None,
) -> str:
    """Call one stakeholder sub-agent with a role prompt and scoped history."""
    system_prompt = _build_system_prompt(role, allowed_info, raw_content, guide_context, session)

    # Include only messages for this role's conversation thread (last 10 turns)
    filtered_history = []
    for msg in history[-10:]:
        if _message_belongs_to_role_thread(msg, role["name"]):
            filtered_history.append(msg)

    # Allow more tokens when a guide block is present so the follow-up fits
    max_tokens = 600 if guide_context else 400
    raw = await chat(
        system_prompt,
        student_message,
        history=filtered_history,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return _strip_boundary_check(raw)


_BOUNDARY_TAIL = 60  # buffer size to safely strip trailing <boundary_check> tag


async def stream_sub_agent(
    role: dict,
    allowed_info: list,
    history: list,
    student_message: str,
    raw_content: str = "",
    guide_context: dict | None = None,
    session: dict | None = None,
):
    system_prompt = _build_system_prompt(role, allowed_info, raw_content, guide_context, session)
    filtered_history = [
        msg for msg in history[-10:]
        if _message_belongs_to_role_thread(msg, role["name"])
    ]

    max_tokens = 600 if guide_context else 400
    buffer = ""
    async for token in stream_chat(
        system_prompt,
        student_message,
        history=filtered_history,
        max_tokens=max_tokens,
        temperature=0.7,
    ):
        buffer += token
        if len(buffer) > _BOUNDARY_TAIL:
            yield buffer[:-_BOUNDARY_TAIL]
            buffer = buffer[-_BOUNDARY_TAIL:]

    if buffer:
        yield _strip_boundary_check(buffer)
