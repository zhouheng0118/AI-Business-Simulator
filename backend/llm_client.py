"""Centralized LLM access for CaseIQ agents.

All model calls should go through this module so provider, model name, retry
policy, and fallback behavior can be changed in one place.
"""

from __future__ import annotations

import os
import re
import logging
from collections.abc import Mapping, Sequence
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dotenv is optional for tests
    load_dotenv = None

if load_dotenv:
    load_dotenv()

MODEL_BASE_URL: str = os.getenv(
    "MODEL_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
)
MODEL_NAME: str = (
    os.getenv("GEMMA_MODEL")
    or os.getenv("GEMINI_MODEL")
    or "gemma-4-26b-a4b-it"
)
MODEL_API_KEY: str | None = (
    os.getenv("GEMMA_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
)
TEMPERATURE: float = float(os.getenv("MODEL_TEMPERATURE", "0.7"))
MAX_TOKENS: int = int(os.getenv("MODEL_MAX_TOKENS", "1024"))
FALLBACK_REPLY = "I need to think about that more carefully. Could you rephrase the question?"

logger = logging.getLogger(__name__)


def _strip_hidden_thoughts(text: str) -> str:
    """Remove provider-emitted hidden reasoning tags from visible output."""
    return re.sub(
        r"\s*<thought>.*?</thought>\s*",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()


def _to_openai_role(role: str) -> str:
    """Convert app-specific message roles into OpenAI-compatible roles."""
    if role in {"agent", "assistant"}:
        return "assistant"
    return "user"


def _mock_reply(system_prompt: str, user_message: str) -> str:
    """Return a deterministic local reply when no model key is configured."""
    lower_prompt = system_prompt.lower()
    if "chief financial officer" in lower_prompt or "cfo" in lower_prompt:
        return (
            "From a finance perspective, we need to confirm whether the unit economics hold. "
            "I would focus on ARPU, licensing costs, revenue sharing, and payback period before supporting further investment."
        )
    return (
        "I can answer based on the information available to my role, but this question needs more precision. "
        f"You asked: {user_message}"
    )


async def chat(
    system_prompt: str,
    user_message: str,
    history: Sequence[Mapping[str, Any]] | None = None,
    *,
    max_tokens: int = MAX_TOKENS,
    temperature: float = TEMPERATURE,
) -> str:
    """Call the configured chat model and return plain assistant text.

    Args:
        system_prompt: The system/developer instruction for the model.
        user_message: The latest user message.
        history: Optional prior app messages. Supports ``student``, ``agent``,
            and ``assistant`` roles.
        max_tokens: Maximum output tokens for this call.
        temperature: Sampling temperature.

    Returns:
        The model response text. If the provider is unavailable or no API key
        is configured, returns a safe fallback/mock response instead.
    """
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in history or []:
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        messages.append(
            {
                "role": _to_openai_role(str(item.get("role", "student"))),
                "content": content,
            }
        )
    messages.append({"role": "user", "content": user_message})

    if not MODEL_API_KEY:
        return _mock_reply(system_prompt, user_message)

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(base_url=MODEL_BASE_URL, api_key=MODEL_API_KEY)
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        raw = response.choices[0].message.content or ""
        return _strip_hidden_thoughts(raw) or FALLBACK_REPLY
    except Exception as exc:
        logger.exception(
            "Model chat completion failed for model=%s base_url=%s: %s",
            MODEL_NAME,
            MODEL_BASE_URL,
            exc,
        )
        return FALLBACK_REPLY


async def complete(
    prompt: str,
    *,
    max_tokens: int = MAX_TOKENS,
    temperature: float = 0.0,
) -> str:
    """Run a single-turn utility completion for extraction/classification."""
    return await chat(
        "You are a precise assistant. Follow the requested output format exactly.",
        prompt,
        max_tokens=max_tokens,
        temperature=temperature,
    )
