from __future__ import annotations

"""Centralized LLM access for CaseIQ agents.

All model calls should go through this module so provider, model name, retry
policy, and fallback behavior can be changed in one place.
"""

import asyncio
import os
import re
import time
import logging
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
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

# Support multiple comma-separated keys: GEMMA_API_KEY=key1,key2,key3
_raw_keys: str | None = (
    os.getenv("GEMMA_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
)
_API_KEYS: list[str] = [k.strip() for k in _raw_keys.split(",") if k.strip()] if _raw_keys else []

TEMPERATURE: float = float(os.getenv("MODEL_TEMPERATURE", "0.7"))
MAX_TOKENS: int = int(os.getenv("MODEL_MAX_TOKENS", "1024"))
FALLBACK_REPLY = "I need to think about that more carefully. Could you rephrase the question?"

logger = logging.getLogger(__name__)


class _KeyPool:
    """Round-robin API key pool with pre-built clients and per-key rate-limit cooldown."""

    _COOLDOWN = 60.0

    def __init__(self, keys: list[str], base_url: str) -> None:
        from openai import AsyncOpenAI
        self._keys = keys
        # Pre-build one client per key so there's zero setup cost per call
        self._clients: dict[str, AsyncOpenAI] = {
            k: AsyncOpenAI(base_url=base_url, api_key=k) for k in keys
        }
        self._cooldown_until: dict[str, float] = {}
        self._index = 0
        self._lock = asyncio.Lock()

    def __len__(self) -> int:
        return len(self._keys)

    async def next(self) -> tuple[str, Any] | tuple[None, None]:
        """Return (key, client) for next available key, skipping cooled-down ones."""
        async with self._lock:
            now = time.monotonic()
            for _ in range(len(self._keys)):
                key = self._keys[self._index % len(self._keys)]
                self._index += 1
                if now >= self._cooldown_until.get(key, 0):
                    return key, self._clients[key]
            return None, None  # all keys are cooling down

    async def mark_rate_limited(self, key: str, wait: float) -> None:
        async with self._lock:
            self._cooldown_until[key] = time.monotonic() + wait
            logger.warning("Key ...%s rate-limited; cooling down %.0fs", key[-6:], wait)


_pool = _KeyPool(_API_KEYS, MODEL_BASE_URL)

# Each key handles up to 4 concurrent calls for maximum parallelism
_LLM_SEMAPHORE = asyncio.Semaphore(max(len(_API_KEYS), 1) * 4)


def _strip_hidden_thoughts(text: str) -> str:
    return re.sub(
        r"\s*<thought>.*?</thought>\s*",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()


_THOUGHT_OPEN = "<thought>"
_THOUGHT_CLOSE = "</thought>"


async def _filter_thought_tags(source: AsyncIterator[str]) -> AsyncIterator[str]:
    suppressing = False
    buf = ""

    async for chunk in source:
        buf += chunk
        while True:
            if suppressing:
                idx = buf.lower().find(_THOUGHT_CLOSE.lower())
                if idx >= 0:
                    buf = buf[idx + len(_THOUGHT_CLOSE):]
                    suppressing = False
                else:
                    if len(buf) > len(_THOUGHT_CLOSE):
                        buf = buf[-len(_THOUGHT_CLOSE):]
                    break
            else:
                idx = buf.lower().find(_THOUGHT_OPEN.lower())
                if idx >= 0:
                    if idx > 0:
                        yield buf[:idx]
                    buf = buf[idx + len(_THOUGHT_OPEN):]
                    suppressing = True
                else:
                    safe = len(buf) - (len(_THOUGHT_OPEN) - 1)
                    if safe > 0:
                        yield buf[:safe]
                        buf = buf[safe:]
                    break

    if not suppressing and buf:
        yield buf


def _to_openai_role(role: str) -> str:
    if role in {"agent", "assistant"}:
        return "assistant"
    return "user"


def _mock_reply(system_prompt: str, user_message: str) -> str:
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


def _build_messages(
    system_prompt: str,
    user_message: str,
    history: Sequence[Mapping[str, Any]] | None,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in history or []:
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        messages.append({"role": _to_openai_role(str(item.get("role", "student"))), "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages


async def chat(
    system_prompt: str,
    user_message: str,
    history: Sequence[Mapping[str, Any]] | None = None,
    *,
    max_tokens: int = MAX_TOKENS,
    temperature: float = TEMPERATURE,
) -> str:
    if not _API_KEYS:
        return _mock_reply(system_prompt, user_message)

    from openai import RateLimitError

    messages = _build_messages(system_prompt, user_message, history)

    for attempt in range(len(_API_KEYS) * 2 + 1):
        key, client = await _pool.next()
        if key is None:
            logger.warning("All API keys rate-limited; waiting 30s")
            await asyncio.sleep(30)
            continue

        try:
            async with _LLM_SEMAPHORE:
                response = await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            raw = response.choices[0].message.content or ""
            return _strip_hidden_thoughts(raw) or FALLBACK_REPLY
        except RateLimitError as exc:
            match = re.search(r"retry in (\d+(?:\.\d+)?)", str(exc), re.IGNORECASE)
            wait = float(match.group(1)) if match else 30.0
            wait = min(wait + 2, 90)
            await _pool.mark_rate_limited(key, wait)
        except Exception as exc:
            logger.exception("Model chat failed key=...%s model=%s: %s", key[-6:], MODEL_NAME, exc)
            return FALLBACK_REPLY

    logger.error("All keys exhausted after %d attempts; returning fallback", attempt + 1)
    return FALLBACK_REPLY


async def complete(
    prompt: str,
    *,
    max_tokens: int = MAX_TOKENS,
    temperature: float = 0.0,
) -> str:
    return await chat(
        "You are a precise assistant. Follow the requested output format exactly.",
        prompt,
        max_tokens=max_tokens,
        temperature=temperature,
    )


async def stream_chat(
    system_prompt: str,
    user_message: str,
    history: Sequence[Mapping[str, Any]] | None = None,
    *,
    max_tokens: int = MAX_TOKENS,
    temperature: float = TEMPERATURE,
) -> AsyncIterator[str]:
    if not _API_KEYS:
        mock = _mock_reply(system_prompt, user_message)
        for word in mock.split():
            yield word + " "
            await asyncio.sleep(0.04)
        return

    from openai import RateLimitError

    messages = _build_messages(system_prompt, user_message, history)

    for _ in range(len(_API_KEYS) * 2 + 1):
        key, client = await _pool.next()
        if key is None:
            logger.warning("All API keys rate-limited; waiting 30s")
            await asyncio.sleep(30)
            continue

        try:
            async with _LLM_SEMAPHORE:
                stream = await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )

            async def _raw():
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta

            async for token in _filter_thought_tags(_raw()):
                yield token
            return
        except RateLimitError as exc:
            match = re.search(r"retry in (\d+(?:\.\d+)?)", str(exc), re.IGNORECASE)
            wait = float(match.group(1)) if match else 30.0
            wait = min(wait + 2, 90)
            await _pool.mark_rate_limited(key, wait)
        except Exception as exc:
            logger.exception("Streaming chat failed key=...%s: %s", key[-6:], exc)
            yield FALLBACK_REPLY
            return

    yield FALLBACK_REPLY
