import re
from pathlib import Path

from agents.role_types import infer_role_type
from llm_client import chat


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


def _load_prompt_template(role: dict) -> str:
    """Load the best matching role prompt template from agents/prompts."""
    role_type = infer_role_type(role)
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


def _build_system_prompt(role: dict, allowed_info: list, raw_content: str = "") -> str:
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

    template = _load_prompt_template(role)
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
    role: dict, allowed_info: list, history: list, student_message: str, raw_content: str = ""
) -> str:
    """Call one stakeholder sub-agent with a role prompt and scoped history."""
    system_prompt = _build_system_prompt(role, allowed_info, raw_content)

    # Include only messages for this role's conversation thread (last 10 turns)
    filtered_history = []
    for msg in history[-10:]:
        if _message_belongs_to_role_thread(msg, role["name"]):
            filtered_history.append(msg)

    raw = await chat(
        system_prompt,
        student_message,
        history=filtered_history,
        max_tokens=400,
        temperature=0.7,
    )
    return _strip_boundary_check(raw)
