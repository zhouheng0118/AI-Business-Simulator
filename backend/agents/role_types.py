"""Stable stakeholder role types for CaseIQ simulations."""

from __future__ import annotations

import re


ROLE_TYPE_LABELS = {
    "strategy": "Strategy Sponsor",
    "finance": "Finance Gatekeeper",
    "operations": "Operations Lead",
    "local_regulatory": "Local / Regulatory Expert",
    "customer_market": "Customer / Market Voice",
}

ROLE_TYPE_ALIASES = {
    "strategy": {
        "ceo",
        "chief executive officer",
        "founder",
        "general manager",
        "strategy sponsor",
        "strategy",
        "战略负责人",
    },
    "finance": {
        "cfo",
        "chief financial officer",
        "finance director",
        "finance gatekeeper",
        "finance",
        "财务负责人",
    },
    "operations": {
        "head of operations",
        "operations director",
        "vp of operations",
        "vp ops",
        "operations manager",
        "operations lead",
        "operations",
        "运营负责人",
    },
    "local_regulatory": {
        "local expert",
        "market consultant",
        "city official",
        "regulator",
        "regulatory expert",
        "local regulatory",
        "local / regulatory expert",
        "paris transport commissioner",
        "本地专家",
        "监管专家",
    },
    "customer_market": {
        "customer rep",
        "customer representative",
        "target market customer",
        "user representative",
        "rider",
        "commuter",
        "customer market",
        "customer / market voice",
        "customer",
        "客户代表",
    },
}


def normalize_label(value: object) -> str:
    """Normalize labels for role matching."""
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def canonical_role_type(value: object) -> str | None:
    """Return a stable role_type for a label or alias."""
    normalized = normalize_label(value)
    if not normalized:
        return None
    if normalized in ROLE_TYPE_LABELS:
        return normalized

    for role_type, aliases in ROLE_TYPE_ALIASES.items():
        if normalized in aliases:
            return role_type
    return None


def infer_role_type(role: dict) -> str | None:
    """Infer a stable role_type from explicit metadata or role labels."""
    explicit = canonical_role_type(role.get("role_type"))
    if explicit:
        return explicit

    for field in ("name", "title", "focus_area"):
        inferred = canonical_role_type(role.get(field))
        if inferred:
            return inferred

    combined = " ".join(
        str(role.get(field, "")) for field in ("name", "title", "focus_area")
    )
    combined_label = normalize_label(combined)
    for role_type, aliases in ROLE_TYPE_ALIASES.items():
        if any(alias in combined_label for alias in aliases):
            return role_type

    return None


def role_type_matches(role: dict, target_role: str) -> bool:
    """Return whether a role matches the requested stable role type."""
    target_type = canonical_role_type(target_role)
    return bool(target_type and infer_role_type(role) == target_type)
