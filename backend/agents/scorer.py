"""LLM-based scoring engine for student answer submissions."""

import json
import re
from llm_client import complete

_DEFAULT_DIMENSIONS = [
    {"name": "Evidence Use", "weight": 25},
    {"name": "Analytical Depth", "weight": 25},
    {"name": "Recommendation Quality", "weight": 25},
    {"name": "Risk Awareness", "weight": 25},
]

_DEFAULT_QUESTIONS: dict[str, dict] = {
    "decision": {
        "id": "q_default",
        "type": "decision",
        "text": "Based on your stakeholder interviews, what is your recommendation? Justify it with specific evidence and address the key risks.",
        "rubric_dimensions": _DEFAULT_DIMENSIONS,
    },
    "analysis": {
        "id": "q_default",
        "type": "analysis",
        "text": "Analyze the key factors influencing this business situation. What are the most critical insights from your stakeholder interviews?",
        "rubric_dimensions": _DEFAULT_DIMENSIONS,
    },
    "reflection": {
        "id": "q_default",
        "type": "reflection",
        "text": "Reflect on the case. What were the most important insights from your interviews, and what would you advise the decision-maker to do?",
        "rubric_dimensions": _DEFAULT_DIMENSIONS,
    },
}


def get_default_question(case_type: str) -> dict:
    return _DEFAULT_QUESTIONS.get(case_type, _DEFAULT_QUESTIONS["decision"])


async def score_answer(
    question: dict,
    answer: str,
    evidence_board: list,
    case_context: dict,
) -> dict:
    """Score one student answer. Returns a question-level score dict."""
    dims: list[dict] = question.get("rubric_dimensions") or _DEFAULT_DIMENSIONS
    total_max = sum(d["weight"] for d in dims)

    evidence_text = "\n".join(
        f"- [{e.get('source', '?')}] {e.get('key_info', '')} (data: {e.get('data', '')})"
        for e in evidence_board[:15]
    ) or "No evidence collected."

    dim_list = "\n".join(
        f"- {d['name']} (0–{d['weight']} points)" for d in dims
    )

    case = case_context.get("case") or {}

    prompt = f"""You are an expert business school professor evaluating a student's case analysis.

Case: {case.get('title', 'Business Case')}
Description: {case.get('description', '')}

Evidence the student collected during interviews:
{evidence_text}

Question: {question.get('text', '')}

Student's Answer:
{answer}

Score the student on each of these dimensions:
{dim_list}

Return ONLY valid JSON with no markdown:
{{
  "dimension_scores": [
    {{"name": "<dimension name>", "score": <integer 0-max>, "max_score": <max>, "comment": "<1 concise sentence>"}}
  ],
  "feedback": "<2-3 sentence personalized constructive feedback>",
  "strengths": ["<strength>", "<strength>"],
  "improvements": ["<area to improve>", "<area to improve>"]
}}"""

    raw = await complete(prompt, max_tokens=800)
    parsed = _parse_score(raw, dims)

    q_total = sum(d["score"] for d in parsed["dimension_scores"])
    return {
        "question_id": question.get("id", "q_default"),
        "question_type": question.get("type", "decision"),
        "dimension_scores": parsed["dimension_scores"],
        "question_total": q_total,
        "question_max": total_max,
        "feedback": parsed["feedback"],
        "strengths": parsed.get("strengths", []),
        "improvements": parsed.get("improvements", []),
    }


def _parse_score(raw: str, dims: list) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return _fallback_score(dims)

    if not isinstance(data, dict):
        return _fallback_score(dims)

    raw_dim_scores = data.get("dimension_scores") or []
    dim_scores = []
    for dim in dims:
        matched = next(
            (d for d in raw_dim_scores if str(d.get("name", "")).lower() == dim["name"].lower()),
            None,
        )
        if matched:
            score = min(dim["weight"], max(0, int(float(matched.get("score", dim["weight"] // 2)))))
            comment = str(matched.get("comment", ""))
        else:
            score = dim["weight"] // 2
            comment = ""
        dim_scores.append({"name": dim["name"], "score": score, "max_score": dim["weight"], "comment": comment})

    return {
        "dimension_scores": dim_scores,
        "feedback": str(data.get("feedback", "")),
        "strengths": list(data.get("strengths", [])),
        "improvements": list(data.get("improvements", [])),
    }


def _fallback_score(dims: list) -> dict:
    return {
        "dimension_scores": [
            {"name": d["name"], "score": d["weight"] // 2, "max_score": d["weight"], "comment": ""}
            for d in dims
        ],
        "feedback": "Your analysis demonstrates engagement with the case. To strengthen your response, reference specific evidence points and address risks more explicitly.",
        "strengths": ["Engaged with the case materials"],
        "improvements": ["Reference specific data from interviews", "Address key business risks explicitly"],
    }
