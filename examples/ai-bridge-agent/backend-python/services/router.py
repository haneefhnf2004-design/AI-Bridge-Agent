"""Router engine — port of routerEngine.js (16-factor scorer, simplified)."""
from __future__ import annotations

import math
import re

MODELS = [
    {"id": "openai/gpt-4o", "provider": "openai", "quality": 96, "coding": 94, "latency": 62, "cost": 68, "window": 128000, "free": False, "vision": True},
    {"id": "openai/gpt-4o-mini", "provider": "openai", "quality": 84, "coding": 82, "latency": 92, "cost": 92, "window": 128000, "free": False, "vision": True},
    {"id": "openai/o1", "provider": "openai", "quality": 98, "coding": 96, "latency": 38, "cost": 42, "window": 200000, "free": False, "vision": False},
    {"id": "anthropic/claude-3.5-sonnet", "provider": "anthropic", "quality": 97, "coding": 95, "latency": 65, "cost": 62, "window": 200000, "free": False, "vision": True},
    {"id": "anthropic/claude-3-haiku", "provider": "anthropic", "quality": 82, "coding": 78, "latency": 94, "cost": 90, "window": 200000, "free": True, "vision": True},
    {"id": "google/gemini-2.0-flash", "provider": "google", "quality": 90, "coding": 88, "latency": 96, "cost": 88, "window": 1000000, "free": True, "vision": True},
    {"id": "google/gemini-1.5-pro", "provider": "google", "quality": 93, "coding": 90, "latency": 70, "cost": 72, "window": 2000000, "free": False, "vision": True},
    {"id": "meta-llama/llama-3.3-70b-instruct", "provider": "meta-llama", "quality": 88, "coding": 86, "latency": 84, "cost": 96, "window": 128000, "free": True, "vision": False},
    {"id": "deepseek/deepseek-v3", "provider": "deepseek", "quality": 91, "coding": 93, "latency": 78, "cost": 96, "window": 128000, "free": True, "vision": False},
    {"id": "deepseek/deepseek-r1", "provider": "deepseek", "quality": 92, "coding": 94, "latency": 52, "cost": 88, "window": 128000, "free": False, "vision": False},
    {"id": "mistralai/mistral-large", "provider": "mistralai", "quality": 89, "coding": 87, "latency": 80, "cost": 80, "window": 128000, "free": True, "vision": False},
    {"id": "qwen/qwen-2.5-72b-instruct", "provider": "qwen", "quality": 87, "coding": 88, "latency": 82, "cost": 94, "window": 128000, "free": True, "vision": False},
]


def analyze_task(messages: list) -> str:
    text = "\n".join(str(m.get("content", "")) if isinstance(m, dict) else "" for m in (messages or []))[:6000]
    ln = len(text)
    if re.search(r"(image|photo|diagram|screenshot|vision|ocr)", text, re.I):
        return "vision"
    if re.search(r"(code|function|class|api|bug|error|stack ?trace|typescript|javascript|python|react|node|sql|regex|algorithm|refactor|debug|implement)", text, re.I):
        return "coding"
    if re.search(r"(summarize|long document|paper|pdf|book|transcript)", text, re.I) or ln > 8000:
        return "long-context"
    if re.search(r"(prove|reason|logic|math|solve|analyze|compare|evaluate|explain why|tradeoff|architecture)", text, re.I):
        return "reasoning"
    if re.search(r"(quick|fast|short answer|tl;dr|translate|rephrase)", text, re.I):
        return "fast"
    if re.search(r"(story|poem|write|blog|essay|marketing|brand)", text, re.I):
        return "creative"
    return "general"


def _hash(s: str) -> int:
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return abs(h)


def score_models(task: str, opts: dict | None = None) -> list:
    opts = opts or {}
    cheap = bool(opts.get("cheap"))
    prefer_free = bool(opts.get("preferFree"))
    w = {
        "quality": 0.28 if task == "reasoning" else (0.18 if task == "coding" else 0.22),
        "coding": 0.28 if task == "coding" else 0.08,
        "latency": 0.26 if task == "fast" else 0.12,
        "cost": 0.26 if cheap else 0.10,
        "window": 0.22 if task == "long-context" else 0.04,
        "reliability": 0.06,
        "freshness": 0.04,
        "vision": 0.18 if task == "vision" else 0.00,
        "free": 0.08 if prefer_free else 0.02,
    }
    total = sum(w.values())
    for k in w:
        w[k] /= total
    ranked = []
    for m in MODELS:
        score = 0.0
        score += m["quality"] * w["quality"]
        score += m["coding"] * w["coding"]
        score += m["latency"] * w["latency"]
        score += m["cost"] * w["cost"]
        win = min(100.0, 18 * math.log2(m["window"] / 8000 + 1))
        score += win * w["window"]
        score += 88 * w["reliability"]
        score += 82 * w["freshness"]
        if task == "vision":
            score += (100 if m["vision"] else 10) * w["vision"]
        score += (100 if m["free"] else 55) * w["free"]
        jitter = (_hash(m["id"]) % 7) - 3
        ranked.append({**m, "score": round(score + jitter, 1), "task": task})
    ranked.sort(key=lambda x: -x["score"])
    return ranked


def resolve_selector(selector: str, messages: list, opts: dict | None = None) -> dict:
    opts = opts or {}
    task = analyze_task(messages)
    if selector in ("auto", "fusion"):
        ranked = score_models(task, opts)
        return {"task": task, "selector": selector, "ranked": ranked,
                "chosen": ranked[0], "alternatives": ranked[1:4]}
    if selector == "auto/coding":
        ranked = score_models("coding", opts)
        return {"task": "coding", "selector": selector, "ranked": ranked,
                "chosen": ranked[0], "alternatives": ranked[1:4]}
    if selector == "auto/fast":
        ranked = score_models("fast", {**opts, "cheap": True})
        return {"task": "fast", "selector": selector, "ranked": ranked,
                "chosen": ranked[0], "alternatives": ranked[1:4]}
    if selector == "auto/cheap":
        ranked = score_models(task, {**opts, "cheap": True, "preferFree": True})
        return {"task": task, "selector": selector, "ranked": ranked,
                "chosen": ranked[0], "alternatives": ranked[1:4]}
    if selector == "auto/long-context":
        ranked = score_models("long-context", opts)
        return {"task": "long-context", "selector": selector, "ranked": ranked,
                "chosen": ranked[0], "alternatives": ranked[1:4]}
    explicit = next((m for m in MODELS if m["id"] == selector), None)
    if explicit:
        rest = sorted((m for m in MODELS if m["id"] != selector),
                      key=lambda x: -x["quality"])
        ranked = [explicit, *rest]
        return {"task": task, "selector": selector, "ranked": ranked,
                "chosen": explicit, "alternatives": ranked[1:4]}
    ranked = score_models(task, opts)
    return {"task": task, "selector": selector, "ranked": ranked,
            "chosen": ranked[0], "alternatives": ranked[1:4]}


def explain_selection(result: dict) -> str:
    chosen = result["chosen"]
    alts = ", ".join(a["id"] for a in result.get("alternatives", []))
    score = chosen.get("score", "?")
    return (f"Task: {result['task']} \u00b7 Selector: {result['selector']} \u2192 "
            f"Chosen: {chosen['id']} (score {score}) \u00b7 Alts: {alts} \u00b7 "
            "16-factor: quality/coding/latency/cost/window/reliability/freshness/vision/free + jitter")
