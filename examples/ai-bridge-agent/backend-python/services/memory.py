"""Memory engine — port of memoryEngine.js (clean pipeline, simplified)."""
from __future__ import annotations

import math
import re


def estimate_tokens(text) -> int:
    return math.ceil(len(text or "") / 4)


def estimate_messages_tokens(messages: list) -> int:
    total = 0
    for m in messages or []:
        c = m.get("content", "") if isinstance(m, dict) else ""
        total += estimate_tokens(c if isinstance(c, str) else str(c)) + 4
    return total


def clean_format(messages: list) -> list:
    out = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = m.get("role") if m.get("role") in ("assistant", "system") else "user"
        content = str(m.get("content", "") or "").strip()
        if not content:
            continue
        content = re.sub(r"^(You said:|Assistant said:|Copy code|Edit)\s*", "", content, flags=re.I | re.M).strip()
        content = re.sub(r"\n{3,}", "\n\n", content)
        if len(content) > 12000:
            content = content[:12000] + "\n…[truncated]"
        if out and out[-1]["role"] == role and out[-1]["content"] == content:
            continue
        out.append({"role": role, "content": content})
    while out and out[0]["role"] == "assistant":
        out.pop(0)
    return out


def _extractive_summary(msgs: list) -> str:
    all_text = "\n\n".join(f"{m['role'].upper()}: {m['content']}" for m in msgs)
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", all_text) if len(s.strip()) > 20]
    keywords = ["error", "fix", "implement", "build", "deploy", "model", "api",
                "route", "token", "context", "bridge", "transfer", "memory", "resilience"]
    scored = []
    for s in sentences:
        kw = sum(1 for k in keywords if k in s.lower())
        scored.append((kw * 12 + min(len(s), 180) / 18, s))
    scored.sort(key=lambda x: -x[0])
    top = scored[:6]
    top.sort(key=lambda x: sentences.index(x[1]))
    return "\n".join(f"• {s.strip()}" for _, s in top)


def summarize_if_needed(messages: list, budget: int = 6000) -> dict:
    tokens = estimate_messages_tokens(messages)
    if tokens <= budget or len(messages) <= 6:
        return {"messages": messages, "summarized": False, "saved": 0, "summary": None}
    head, tail = messages[:2], messages[-24:]
    middle = messages[2:-24]
    if not middle:
        return {"messages": messages, "summarized": False, "saved": 0, "summary": None}
    summary = _extractive_summary(middle)
    saved_mid = estimate_messages_tokens(middle) - estimate_tokens(summary)
    summary_msg = {"role": "system",
                   "content": f"[Memory Summary — {len(middle)} earlier messages compressed · saved ~{saved_mid} tokens]\n{summary}"}
    nxt = [*head, summary_msg, *tail]
    return {"messages": nxt, "summarized": True,
            "saved": tokens - estimate_messages_tokens(nxt), "summary": summary}


_REPLACEMENTS = {"in order to": "to", "due to the fact that": "because",
                 "at this point in time": "now"}


def optimize_tokens(messages: list, level: str = "rtk") -> list:
    out = []
    for m in messages:
        t = m["content"]
        t = re.sub(r"\b(in order to|due to the fact that|at this point in time)\b",
                   lambda mo: _REPLACEMENTS.get(mo.group(0).lower(), mo.group(0)), t, flags=re.I)
        t = re.sub(r" {2,}", " ", t)
        t = re.sub(r"\n{2,}", "\n\n", t)
        if level == "caveman":
            t = "\n".join(l.strip() for l in t.split("\n") if l.strip())[:40 * 200]
            lines = t.split("\n")[:40]
            t = "\n".join(lines)
            if len(t) > 3000:
                t = t[:3000] + "\n…[caveman-compressed]"
        out.append({**m, "content": t})
    return out


_COMPRESS_LEVELS = {"llmlingua2", "llmlingua-2", "ultra", "omniglyph", "gcf",
                    "stacked", "aggressive", "lite", "standard", "semantic", "extractive"}


def process_memory_pipeline(messages: list, opts: dict | None = None) -> dict:
    opts = opts or {}
    if not isinstance(messages, list):
        messages = []
    level = str(opts.get("level", "rtk") or "rtk")
    budget = int(opts.get("budget", 6000) or 6000)
    cleaned = clean_format(messages)
    lvl = level.lower()
    needs = (estimate_messages_tokens(cleaned) > budget * 0.6
             or any(len(m["content"]) > 2000 for m in cleaned))
    if lvl in _COMPRESS_LEVELS and needs:
        optimized = []
        for m in cleaned:
            c = m["content"]
            t = c
            if lvl in ("ultra", "stacked"):
                words = t.split()
                t = " ".join(words[: max(1, int(len(words) * 0.35))])
            elif lvl in ("aggressive", "llmlingua2", "llmlingua-2"):
                t = t[: int(len(t) * 0.45)]
            elif lvl in ("gcf", "semantic"):
                t = t[: int(len(t) * 0.58)]
            if len(t) < len(c):
                t += f"\n…[{lvl}-compressed]"
            optimized.append({**m, "content": t})
    else:
        optimized = optimize_tokens(cleaned, level)
    s = summarize_if_needed(optimized, budget)
    final = s["messages"]
    return {
        "messages": final,
        "stats": {
            "originalCount": len(messages),
            "cleanedCount": len(cleaned),
            "finalCount": len(final),
            "originalTokens": estimate_messages_tokens(messages),
            "finalTokens": estimate_messages_tokens(final),
            "summarized": s["summarized"],
            "savedTokens": s["saved"],
            "summary": s["summary"],
            "engine": level,
            "pipeline": f"Bridge Engine: clean → {level} → summarize",
        },
    }
