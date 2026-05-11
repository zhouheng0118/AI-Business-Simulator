import re
from config import llm_client, MODEL_NAME


def _build_system_prompt(role: dict, allowed_info: list) -> str:
    allowed_str = (
        "\n".join(f"- {info}" for info in allowed_info)
        if allowed_info
        else "(none)"
    )
    locked_str = (
        "\n".join(f"- {info}" for info in role.get("locked_info", []))
        or "(none)"
    )

    return f"""You are {role["name"]}, {role["title"]} at the company in this business case study.

Your persona: {role["persona"]}
Your focus area: {role["focus_area"]}

[Information you CAN share in this conversation]
{allowed_str}

[Information you MUST NOT reveal — do not mention even indirectly]
{locked_str}

You are being interviewed by a business school student who is analyzing a strategic decision.
Answer naturally and stay in character. Keep replies concise (2-4 sentences).
If asked about something outside your domain, redirect the student to the relevant person.
Do not volunteer locked information even if asked indirectly.

End your response with exactly this self-check line:
<boundary_check>NO</boundary_check>"""


def _strip_boundary_check(text: str) -> str:
    return re.sub(
        r"\s*<boundary_check>.*?</boundary_check>",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()


async def call_sub_agent(
    role: dict, allowed_info: list, history: list, student_message: str
) -> str:
    system_prompt = _build_system_prompt(role, allowed_info)

    # Include only messages for this role's conversation thread (last 10 turns)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-10:]:
        if msg.get("agent_name") == role["name"] or msg["role"] == "student":
            openai_role = (
                "assistant" if msg["role"] in ("agent", "assistant") else "user"
            )
            messages.append({"role": openai_role, "content": msg["content"]})
    messages.append({"role": "user", "content": student_message})

    response = await llm_client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        max_tokens=400,
        temperature=0.7,
    )
    raw = response.choices[0].message.content or ""
    return _strip_boundary_check(raw)
