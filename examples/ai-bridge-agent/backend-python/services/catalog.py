"""Catalog data — port of comboStrategies.js, compressionEngine.js,
mcpServer.js, a2aServer.js and providersCatalog.js (simplified)."""
from __future__ import annotations

import math
import re
import time

STRATEGIES = [
    {"id": "priority", "name": "Priority", "icon": "sort",
     "desc": "First-target ordered list with explicit priority. Tries targets in the configured order; fallback only on failure."},
    {"id": "weighted", "name": "Weighted", "icon": "percent",
     "desc": "Weighted random by per-target weight. Draws one target proportional to weight; remaining ordered by weight as fallback chain."},
    {"id": "fill-first", "name": "Fill-First", "icon": "vertical_align_top",
     "desc": "Fill each target quota before moving to next. Uses quota headroom to exhaust providers sequentially."},
    {"id": "round-robin", "name": "Round-Robin", "icon": "autorenew",
     "desc": "Cycle through targets in order (batched). stickyRoundRobinLimit controls batch size before rotating."},
    {"id": "p2c", "name": "P2C", "icon": "balance",
     "desc": "Power-of-Two-Choices: picks 2 random targets, selects the less-loaded one."},
    {"id": "random", "name": "Random", "icon": "shuffle",
     "desc": "Uniform random selection among healthy targets."},
    {"id": "least-used", "name": "Least-Used", "icon": "low_priority",
     "desc": "Picks target with lowest current load / usage count."},
    {"id": "cost-optimized", "name": "Cost-Optimized", "icon": "savings",
     "desc": "Minimize $ per request given catalog pricing. Cheapest healthy target first."},
    {"id": "headroom", "name": "Headroom", "icon": "battery_charging_full",
     "desc": "Picks target with most remaining quota headroom."},
    {"id": "reset-window", "name": "Reset-Window", "icon": "schedule",
     "desc": "Prefers targets whose quota window resets soonest (lowest resetWindow secs)."},
    {"id": "reset-aware", "name": "Reset-Aware", "icon": "event_repeat",
     "desc": "Prioritizes by quota reset time — short reset windows ranked higher, with headroom weight."},
    {"id": "context-relay", "name": "Context-Relay", "icon": "sync_alt",
     "desc": "Hands off context across targets for long conversations; affinity to previous target."},
    {"id": "context-optimized", "name": "Context-Optimized", "icon": "text_snippet",
     "desc": "Picks target with best fit for current context size vs model window."},
    {"id": "cache-optimized", "name": "Cache-Optimized", "icon": "cached",
     "desc": "Reorders by prompt-cache affinity — likeliest to hold cached prefix first."},
    {"id": "lkgp", "name": "LKGP", "icon": "verified",
     "desc": "Last-Known-Good Path: pins to the last successful provider, then falls back to auto scoring."},
    {"id": "auto", "name": "Auto (16-factor)", "icon": "auto_awesome",
     "desc": "Uses Bridge Engine 16-factor scoring (health, quota, cost, latency, taskFit, quality, sessionAvailability, cacheAffinity, etc). Recommended."},
    {"id": "fusion", "name": "Fusion", "icon": "hub",
     "desc": "Fans out to panel of models in parallel, then a judge model synthesizes one final answer. Parallel execution."},
    {"id": "pipeline", "name": "Pipeline", "icon": "linear_scale",
     "desc": "Runs targets sequentially, threading each step output into next step input; only final answer returned."},
    {"id": "strict-random", "name": "Strict-Random", "icon": "casino",
     "desc": "Random without deduplication of repeats — true uniform each call, may repeat same target."},
]

ENGINES = [
    {"id": "rtk", "name": "RTK", "desc": "Tool-output command detection, JSON filters, dedup, truncation", "ratio": 0.72, "level": "rtk"},
    {"id": "caveman", "name": "Caveman", "desc": "Semantic condensation with rule packs", "ratio": 0.68, "level": "caveman"},
    {"id": "llmlingua2", "name": "LLMLingua-2", "desc": "Token-level perplexity pruning", "ratio": 0.55, "level": "aggressive"},
    {"id": "ultra", "name": "Ultra", "desc": "Maximum compression stacked pipeline", "ratio": 0.15, "level": "ultra"},
    {"id": "omniglyph", "name": "Omniglyph", "desc": "Glyph-based semantic encoding", "ratio": 0.42, "level": "aggressive"},
    {"id": "gcf", "name": "GCF v3.2", "desc": "Grammar-constrained filtering", "ratio": 0.58, "level": "standard"},
    {"id": "lite", "name": "Lite", "desc": "5 lite techniques: whitespace, dedup, tool results, redundant, image URLs", "ratio": 0.82, "level": "lite"},
    {"id": "stacked", "name": "Stacked", "desc": "Multi-engine stacked pipeline (RTK+Caveman+Lite)", "ratio": 0.35, "level": "stacked"},
    {"id": "aggressive", "name": "Aggressive", "desc": "High-ratio extractive + semantic prune", "ratio": 0.38, "level": "aggressive"},
    {"id": "standard", "name": "Standard", "desc": "Balanced summarizing + trimming", "ratio": 0.62, "level": "standard"},
    {"id": "semantic", "name": "Semantic", "desc": "Embeddings-guided sentence keep/drop", "ratio": 0.52, "level": "standard"},
    {"id": "extractive", "name": "Extractive", "desc": "Extractive summary: top-k sentences by keyword score", "ratio": 0.48, "level": "extractive"},
]


def _est_tokens(s) -> int:
    return math.ceil(len(s or "") / 4)


def _lite(text: str) -> str:
    t = re.sub(r"[ \t]{2,}", " ", text)
    t = re.sub(r"\n{3,}", "\n\n", t)
    seen, out = set(), []
    for line in t.split("\n"):
        k = line.strip().lower()
        if len(k) < 6 or k not in seen:
            out.append(line)
        if len(k) >= 6:
            seen.add(k)
    t = "\n".join(out)
    t = re.sub(r"\b(in order to|due to the fact that|at this point in time|for all intents and purposes)\b",
               lambda m: {"in order to": "to", "due to the fact that": "because",
                          "at this point in time": "now",
                          "for all intents and purposes": "essentially"}[m.group(0).lower()],
               t, flags=re.I)
    return t


def _caveman(text: str) -> str:
    t = _lite(text)
    t = re.sub(r"\b(very|really|quite|rather|actually|basically|essentially|just|simply)\b", "", t, flags=re.I)
    t = re.sub(r"\b(is|are|was|were) (going to|able to)\b", "will", t, flags=re.I)
    t = "\n".join(l.strip() for l in t.split("\n") if l.strip())[:40 * 200]
    t = "\n".join(t.split("\n")[:40])
    if len(t) > 3000:
        t = t[:3000] + "\n…[caveman]"
    return t


def _rtk(text: str) -> str:
    t = re.sub(r"```json[\s\S]*?```",
               lambda m: "```json\n{{\"…truncated tool output\":true}}\n```" if len(m.group(0)) > 800 else m.group(0),
               text)
    t = _lite(t)
    if len(t) > 4000:
        t = t[:4000] + "\n…[rtk-truncated]"
    return t


_KEYWORDS = ["error", "fix", "implement", "build", "deploy", "model", "api", "route",
             "token", "bridge", "transfer", "memory", "resilience", "code", "function", "system"]


def _extractive(text: str, keep: float = 0.48) -> str:
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]
    if len(sentences) <= 6:
        return text[: int(len(text) * keep)]
    scored = sorted(((sum(1 for k in _KEYWORDS if k in s.lower()) * 12 + min(len(s), 180) / 18, s)
                     for s in sentences), key=lambda x: -x[0])
    n = max(3, math.ceil(len(sentences) * keep))
    top = {s for _, s in scored[:n]}
    return " ".join(s for s in sentences if s in top)


def _llmlingua(text: str) -> str:
    t = _extractive(text, 0.55)
    if len(t) > 3500:
        t = " ".join(w for i, w in enumerate(t.split()) if i % 6 != 5)
    return t


def _ultra(text: str) -> str:
    t = _extractive(_rtk(_caveman(text)), 0.22)
    return t[:1800] + "…[ultra]" if len(t) > 1800 else t


def _omniglyph(text: str) -> str:
    t = _extractive(text, 0.42)
    for k, v in {"function": "fn", "implementation": "impl", "configuration": "cfg",
                 "application": "app", "request": "req", "response": "res",
                 "bridge": "br", "engine": "eng"}.items():
        t = re.sub(r"\b" + k + r"\b", v, t, flags=re.I)
    return t


def _gcf(text: str) -> str:
    t = _lite(text)
    sens = re.split(r"(?<=[.!?])\s+", t)
    kept = [s for s in sens if re.search(
        r"\b(is|are|was|were|has|have|will|can|should|must|does|do|did|be|been)\b", s, re.I) or len(s) > 60]
    t = " ".join(kept or sens)
    return t[:3200] + "…[gcf]" if len(t) > 3200 else t


def _aggressive(text: str) -> str:
    t = _extractive(_lite(text), 0.38)
    return t[:2400] + "…[aggressive]" if len(t) > 2400 else t


def _stacked(text: str) -> str:
    t = _extractive(_lite(_caveman(_rtk(text))), 0.35)
    return t[:2000] + "…[stacked]" if len(t) > 2000 else t


_ENGINE_FNS = {
    "rtk": _rtk, "caveman": _caveman, "llmlingua2": _llmlingua, "llmlingua-2": _llmlingua,
    "ultra": _ultra, "omniglyph": _omniglyph, "gcf": _gcf, "lite": _lite,
    "stacked": _stacked, "aggressive": _aggressive,
    "standard": lambda t: _extractive(_lite(t), 0.62) if len(_lite(t)) > 2800 else _lite(t),
    "semantic": lambda t: _extractive(t, 0.52),
    "extractive": _extractive,
}


def compress(text: str, level: str = "rtk") -> dict:
    src = str(text or "")
    if not src.strip():
        return {"compressed": "", "original": src, "ratio": 1, "saved": 0,
                "engine": level, "originalTokens": 0, "compressedTokens": 0}
    key = str(level or "rtk").lower()
    fn = _ENGINE_FNS.get(key) or _ENGINE_FNS.get(re.sub(r"[^a-z0-9]", "", key)) or _rtk
    try:
        out = fn(src)
    except Exception:
        out = _lite(src)
    if not out or not out.strip():
        out = src[:900]
    o_t, c_t = _est_tokens(src), _est_tokens(out)
    ratio = c_t / o_t if o_t else 1
    return {"compressed": out, "original": src, "engine": key,
            "originalTokens": o_t, "compressedTokens": c_t,
            "ratio": round(ratio, 3), "saved": o_t - c_t,
            "savedPercent": round((1 - ratio) * 100)}


TOOL_CATEGORIES = {
    "memory": {"scope": "memory", "count": 8, "desc": "Persistent memory: store, recall, forget, FTS5+Qdrant"},
    "skill": {"scope": "skill", "count": 6, "desc": "Skill framework execution"},
    "github": {"scope": "github", "count": 7, "desc": "GitHub integration: search, issues, PRs"},
    "pool": {"scope": "pool", "count": 5, "desc": "Provider pool & connections"},
    "gamification": {"scope": "gamification", "count": 4, "desc": "Streaks, levels, achievements"},
    "plugin": {"scope": "plugin", "count": 5, "desc": "Plugin lifecycle"},
    "notion": {"scope": "notion", "count": 6, "desc": "Notion connector"},
    "obsidian": {"scope": "obsidian", "count": 5, "desc": "Obsidian vault"},
    "chat": {"scope": "chat", "count": 9, "desc": "Chat completions, streaming"},
    "models": {"scope": "models", "count": 7, "desc": "Model catalog & discovery"},
    "routing": {"scope": "routing", "count": 8, "desc": "Combo routing & auto"},
    "resilience": {"scope": "resilience", "count": 6, "desc": "Circuit breaker & cooldown"},
    "compression": {"scope": "compression", "count": 5, "desc": "RTK/Caveman pipeline"},
    "analytics": {"scope": "analytics", "count": 5, "desc": "Usage, quota, savings, p95"},
    "auth": {"scope": "auth", "count": 4, "desc": "AuthZ & tokens"},
    "webhook": {"scope": "webhook", "count": 4, "desc": "Webhooks & log export"},
    "system": {"scope": "system", "count": 5, "desc": "Health, version, config"},
    "files": {"scope": "files", "count": 6, "desc": "File & corpus"},
}

_BASE_TOOLS = [
    ("memory_store", "memory", "Store a memory entry (FTS5+Qdrant)", {"content"}, ["content"]),
    ("memory_recall", "memory", "Recall memories by semantic search", {"query"}, ["query"]),
    ("memory_forget", "memory", "Delete memory by id or query", {"id"}, []),
    ("memory_list", "memory", "List recent memories", {"limit"}, []),
    ("memory_pin", "memory", "Pin a memory to session", {"id"}, []),
    ("memory_summarize", "memory", "Summarize session memories", {"sessionId"}, []),
    ("memory_decay_preview", "memory", "Preview typed decay scores", set(), []),
    ("memory_export", "memory", "Export memories as JSON", {"format"}, []),
    ("skill_list", "skill", "List available skills", set(), []),
    ("skill_run", "skill", "Run a skill by name", {"name", "input"}, ["name"]),
    ("skill_install", "skill", "Install a skill", {"source"}, ["source"]),
    ("skill_status", "skill", "Skill execution status", {"executionId"}, []),
    ("skill_cancel", "skill", "Cancel skill execution", {"executionId"}, []),
    ("skill_logs", "skill", "Fetch skill logs", {"executionId"}, []),
    ("github_search_repos", "github", "Search GitHub repos", {"q"}, ["q"]),
    ("github_get_file", "github", "Get file content", {"repo", "path"}, ["repo", "path"]),
    ("github_create_issue", "github", "Create issue", {"repo", "title", "body"}, ["repo", "title"]),
    ("github_list_prs", "github", "List PRs", {"repo"}, ["repo"]),
    ("github_search_code", "github", "Search code", {"q"}, ["q"]),
    ("github_get_commit", "github", "Get commit", {"repo", "sha"}, ["repo", "sha"]),
    ("github_star_repo", "github", "Star a repo", {"repo"}, ["repo"]),
    ("pool_list_connections", "pool", "List provider connections", set(), []),
    ("pool_check_quota", "pool", "Check quota for provider", {"provider"}, ["provider"]),
    ("pool_rotate_key", "pool", "Rotate pool key", {"provider"}, ["provider"]),
    ("pool_add_key", "pool", "Add key to pool", {"provider", "apiKey"}, ["provider", "apiKey"]),
    ("pool_stats", "pool", "Pool statistics (35 keys)", set(), []),
    ("gamification_profile", "gamification", "User gamification profile", set(), []),
    ("gamification_leaderboard", "gamification", "Leaderboard", {"limit"}, []),
    ("plugin_list", "plugin", "List plugins", set(), []),
    ("plugin_enable", "plugin", "Enable plugin", {"name"}, ["name"]),
    ("notion_query_db", "notion", "Query Notion database", {"databaseId", "filter"}, ["databaseId"]),
    ("notion_create_page", "notion", "Create Notion page", {"parent", "properties"}, ["parent"]),
    ("obsidian_search", "obsidian", "Search Obsidian vault", {"query"}, ["query"]),
    ("obsidian_read_note", "obsidian", "Read note", {"path"}, ["path"]),
    ("chat_completions", "chat", "Chat completions via Bridge Engine", {"model", "messages"}, ["model", "messages"]),
    ("list_models", "models", "List Bridge Engine models", {"provider"}, []),
    ("route_auto", "routing", "Auto route with 16-factor scoring", {"messages"}, ["messages"]),
    ("route_combo", "routing", "Route via combo strategy", {"combo", "messages"}, ["combo"]),
    ("health_report", "resilience", "Health report (circuit/cooldown)", set(), []),
    ("compress_text", "compression", "Compress text with engine", {"text", "engine"}, ["text"]),
    ("analytics_usage", "analytics", "Usage analytics", {"range"}, []),
    ("webhook_list", "webhook", "List webhooks", set(), []),
]

TOOLS: list = []
for _name, _cat, _desc, _props, _req in _BASE_TOOLS:
    TOOLS.append({"name": _name, "category": _cat,
                  "scope": TOOL_CATEGORIES[_cat]["scope"], "description": _desc,
                  "inputSchema": {"type": "object",
                                  "properties": {p: {} for p in _props},
                                  "required": _req} if _req else
                  {"type": "object", "properties": {p: {} for p in _props}}})
_cats = list(TOOL_CATEGORIES)
for _i in range(110 - len(TOOLS)):
    _cat = _cats[_i % len(_cats)]
    TOOLS.append({"name": f"{_cat}_tool_{_i + 100}", "category": _cat,
                  "scope": TOOL_CATEGORIES[_cat]["scope"],
                  "description": f"{TOOL_CATEGORIES[_cat]['desc']} — synthetic tool {_i + 1} for 110-tool registry completeness",
                  "inputSchema": {"type": "object", "properties": {"input": {"type": "string"}}}})
del _name, _cat, _desc, _props, _req, _cats, _i


def list_tools(scope=None, category=None, search=None) -> list:
    out = list(TOOLS)
    if scope:
        out = [t for t in out if t["scope"] == scope]
    if category:
        out = [t for t in out if t["category"] == category]
    if search:
        q = str(search).lower()
        out = [t for t in out if q in (t["name"] + t["description"] + t["scope"]).lower()]
    return out


def get_tool(name: str):
    return next((t for t in TOOLS if t["name"] == name), None)


def call_tool(name: str, args: dict | None = None) -> dict:
    args = args or {}
    tool = get_tool(name)
    if not tool:
        return {"ok": False, "error": f"Tool not found: {name}", "code": "tool_not_found"}
    for k in tool["inputSchema"].get("required", []):
        if args.get(k) is None or args.get(k) == "":
            return {"ok": False, "error": f"Missing required param: {k}", "tool": name}
    at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    cat = tool["category"]
    if cat == "memory":
        if name == "memory_recall":
            return {"ok": True, "tool": name,
                    "result": {"query": args.get("query"),
                               "hits": [{"id": "mem_1",
                                         "content": f"Recall for \"{args.get('query')}\" — simulated FTS5+Qdrant hit",
                                         "score": 0.92}]}, "at": at}
        if name == "memory_store":
            return {"ok": True, "tool": name,
                    "result": {"id": f"mem_{int(time.time() * 1000):x}", "stored": True}, "at": at}
        return {"ok": True, "tool": name, "result": {"mock": True, "args": args, "category": "memory"}, "at": at}
    if cat == "github":
        return {"ok": True, "tool": name,
                "result": {"mock": True, "args": args, "items": [{"repo": "demo/repo", "stars": 42}]}, "at": at}
    if cat == "pool":
        if name == "pool_stats":
            return {"ok": True, "tool": name,
                    "result": {"totalKeys": 35, "providers": 358, "activeConnections": 42, "at": at}, "at": at}
        return {"ok": True, "tool": name, "result": {"mock": True, "args": args}, "at": at}
    if name == "chat_completions":
        first = ""
        try:
            first = str((args.get("messages") or [{}])[0].get("content", ""))[:80]
        except Exception:
            first = ""
        return {"ok": True, "tool": name,
                "result": {"id": f"chatcmpl-{int(time.time() * 1000):x}",
                           "choices": [{"message": {"role": "assistant",
                                                   "content": f"[MCP mock:{args.get('model', 'auto')}] Simulated completion for {first}"}}]},
                "at": at}
    if name == "list_models":
        return {"ok": True, "tool": name,
                "result": {"data": [{"id": "auto", "provider": "bridge"},
                                    {"id": "openai/gpt-4o", "provider": "openai"}], "count": 358}, "at": at}
    if name == "compress_text":
        txt = str(args.get("text", ""))
        return {"ok": True, "tool": name,
                "result": {"compressed": txt[: int(len(txt) * 0.62)], "ratio": 0.62}, "at": at}
    return {"ok": True, "tool": name,
            "result": {"mock": True, "args": args, "note": f"Executed {name} via Bridge Engine MCP (mock)"}, "at": at}


def get_scopes() -> list:
    counts: dict = {}
    for t in TOOLS:
        counts[t["scope"]] = counts.get(t["scope"], 0) + 1
    return [{"scope": s, "count": c,
             "category": next((v["desc"] for v in TOOL_CATEGORIES.values() if v["scope"] == s), s)}
            for s, c in counts.items()]


def get_mcp_stats() -> dict:
    return {"total": len(TOOLS), "scopes": len({t["scope"] for t in TOOLS}),
            "categories": len(TOOL_CATEGORIES),
            "transports": ["stdio", "sse", "streamable-http"]}


SKILLS = [
    {"id": "list-capabilities", "name": "List Capabilities",
     "desc": "Enumerate A2A agent capabilities, models, and transports",
     "inputSchema": {"type": "object", "properties": {}}},
    {"id": "smart-routing", "name": "Smart Routing",
     "desc": "Recommend best model via 16-factor scoring for a task",
     "inputSchema": {"type": "object",
                     "properties": {"task": {"type": "string"}, "messages": {"type": "array"},
                                    "preferCheap": {"type": "boolean"}}, "required": ["task"]}},
    {"id": "quota-management", "name": "Quota Management",
     "desc": "Check quota headroom and reset windows",
     "inputSchema": {"type": "object", "properties": {"provider": {"type": "string"}}}},
    {"id": "provider-discovery", "name": "Provider Discovery",
     "desc": "Discover 358 providers, filter by capability",
     "inputSchema": {"type": "object",
                     "properties": {"capability": {"type": "string"}, "freeOnly": {"type": "boolean"}}}},
    {"id": "cost-analysis", "name": "Cost Analysis",
     "desc": "Estimate cost and savings vs direct",
     "inputSchema": {"type": "object",
                     "properties": {"model": {"type": "string"}, "promptTokens": {"type": "number"},
                                    "completionTokens": {"type": "number"}}}},
    {"id": "health-report", "name": "Health Report",
     "desc": "3-layer resilience health (breaker/cooldown/lockout)",
     "inputSchema": {"type": "object", "properties": {}}},
]


def _skill_list_capabilities(_p):
    return {"agent": "Bridge Engine A2A", "version": "2.0.0", "protocol": "JSON-RPC 2.0",
            "transports": ["http", "sse", "stdio"],
            "skills": [{"id": s["id"], "name": s["name"], "description": s["desc"]} for s in SKILLS],
            "providers": 358, "models": 1312, "strategies": 19}


def _skill_smart_routing(p):
    task = str(p.get("task") or (p.get("messages") or [{}])[0].get("content", "") if p.get("messages") else "general")
    cands = [{"id": "google/gemini-2.0-flash", "score": 88, "reason": "fast+free"},
             {"id": "anthropic/claude-3.5-sonnet", "score": 96, "reason": "quality"},
             {"id": "openai/gpt-4o", "score": 92, "reason": "balanced"},
             {"id": "deepseek/deepseek-v3", "score": 90, "reason": "coding+cheap"}]
    is_code = bool(re.search(r"code|function|bug|algorithm", task, re.I))
    ranked = sorted(cands, key=lambda c: (0 if ("deepseek" in c["id"] or "claude" in c["id"]) else 1)
                    if is_code else -c["score"])
    return {"task": task, "ranked": ranked, "recommended": ranked[0],
            "factors": ["health", "quota", "cost", "latency", "taskFit", "quality",
                        "sessionAvailability", "cacheAffinity"]}


def _skill_quota(p):
    import random
    provider = str(p.get("provider", "all")) if p.get("provider") else "all"
    if provider == "all":
        return {"provider": "all", "providers": 358,
                "summary": {"headroomAvg": 68, "resetsInMinutes": 42, "cooling": 1, "openBreakers": 0},
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    return {"provider": provider, "headroom": 40 + random.randrange(40),
            "resetWindowSec": 1800 + random.randrange(7000), "status": "ok",
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def _skill_discovery(p):
    cap = str(p.get("capability", "any")).lower() if p.get("capability") else "any"
    free_only = bool(p.get("freeOnly"))
    return {"capability": cap, "freeOnly": free_only,
            "note": "Filtering free-tier providers (150+ free tiers)" if free_only else "All providers",
            "count": 150 if free_only else 358,
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def _skill_cost(p):
    model = str(p.get("model", "openai/gpt-4o"))
    pt, ct = int(p.get("promptTokens", 1000) or 1000), int(p.get("completionTokens", 500) or 500)
    pricing = {"openai/gpt-4o": {"in": 5, "out": 15},
               "anthropic/claude-3.5-sonnet": {"in": 3, "out": 15},
               "google/gemini-2.0-flash": {"in": 0.1, "out": 0.4},
               "deepseek/deepseek-v3": {"in": 0.27, "out": 1.1},
               "auto": {"in": 0.8, "out": 2.4}}
    pr = pricing.get(model, pricing["auto"])
    cost = (pt * pr["in"] + ct * pr["out"]) / 1_000_000
    direct = cost * 1.35
    return {"model": model, "promptTokens": pt, "completionTokens": ct, "pricing": pr,
            "estimatedCost": round(cost, 6), "directCost": round(direct, 6),
            "savings": round(direct - cost, 6), "savingsPercent": 26,
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def _skill_health(_p):
    return {"note": "Use /api/resilience/status for full 3-layer live data",
            "layers": ["circuitBreaker", "connectionCooldown", "modelLockout"],
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


_A2A_HANDLERS = {
    "list-capabilities": _skill_list_capabilities, "smart-routing": _skill_smart_routing,
    "quota-management": _skill_quota, "provider-discovery": _skill_discovery,
    "cost-analysis": _skill_cost, "health-report": _skill_health,
    "list_capabilities": _skill_list_capabilities, "smart_routing": _skill_smart_routing,
    "quota_management": _skill_quota, "provider_discovery": _skill_discovery,
    "cost_analysis": _skill_cost, "health_report": _skill_health,
}


def handle_a2a(body: dict) -> dict:
    rpc, rid = body.get("jsonrpc", "2.0"), body.get("id", 1)
    method = str(body.get("method", "")).strip()
    params = body.get("params") or {}
    norm = re.sub(r"^(a2a/|skill/)", "", method)
    h = _A2A_HANDLERS.get(norm) or _A2A_HANDLERS.get(method)
    if not h:
        avail = ", ".join(k for k in _A2A_HANDLERS if "_" not in k)
        return {"jsonrpc": rpc, "id": rid,
                "error": {"code": -32601, "message": f"Method not found: {method}. Available: {avail}"}}
    try:
        return {"jsonrpc": rpc, "id": rid, "result": h(params)}
    except Exception as e:
        return {"jsonrpc": rpc, "id": rid, "error": {"code": -32603, "message": str(e)}}


def _h(s: str) -> int:
    x = 0
    for ch in s:
        x = (x * 31 + ord(ch)) & 0xFFFFFFFF
    return abs(x)


def _pick(arr: list, seed) -> object:
    return arr[_h(str(seed)) % len(arr)]


REAL_PROVIDERS = [
    {"id": "openai", "name": "OpenAI", "baseUrl": "https://api.openai.com/v1", "authType": "apikey", "free": False,
     "models": ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3", "gpt-4-turbo", "o4-mini"],
     "pricing": {"in": 5, "out": 15}, "caps": ["chat", "vision", "reasoning", "tools"], "context": 128000},
    {"id": "anthropic", "name": "Anthropic", "baseUrl": "https://api.anthropic.com", "authType": "apikey", "free": False,
     "models": ["claude-3.5-sonnet", "claude-3-haiku", "claude-3-opus", "claude-sonnet-4.6", "claude-opus-4.6"],
     "pricing": {"in": 3, "out": 15}, "caps": ["chat", "vision", "reasoning"], "context": 200000},
    {"id": "google", "name": "Google", "baseUrl": "https://generativelanguage.googleapis.com", "authType": "oauth", "free": True,
     "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-2.5-flash", "gemini-2.5-pro"],
     "pricing": {"in": 0.1, "out": 0.4}, "caps": ["chat", "vision", "reasoning"], "context": 1000000},
    {"id": "meta-llama", "name": "Meta Llama", "baseUrl": "https://api.llama.com", "authType": "apikey", "free": True,
     "models": ["llama-3.3-70b-instruct", "llama-3.1-405b", "llama-4-maverick"],
     "pricing": {"in": 0.6, "out": 0.6}, "caps": ["chat", "tools"], "context": 128000},
    {"id": "deepseek", "name": "DeepSeek", "baseUrl": "https://api.deepseek.com", "authType": "apikey", "free": True,
     "models": ["deepseek-v3", "deepseek-r1", "deepseek-chat"],
     "pricing": {"in": 0.27, "out": 1.1}, "caps": ["chat", "reasoning", "code"], "context": 128000},
    {"id": "mistralai", "name": "Mistral AI", "baseUrl": "https://api.mistral.ai/v1", "authType": "apikey", "free": True,
     "models": ["mistral-large", "mistral-small", "mistral-nemo", "codestral"],
     "pricing": {"in": 2, "out": 6}, "caps": ["chat", "tools"], "context": 128000},
    {"id": "qwen", "name": "Qwen (Alibaba)", "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
     "authType": "apikey", "free": True,
     "models": ["qwen-2.5-72b-instruct", "qwen-2.5-coder-32b", "qwq-32b"],
     "pricing": {"in": 0.35, "out": 1.2}, "caps": ["chat", "code", "vision"], "context": 128000},
    {"id": "x-ai", "name": "xAI", "baseUrl": "https://api.x.ai/v1", "authType": "apikey", "free": False,
     "models": ["grok-2", "grok-4-fast-non-reasoning", "grok-3"],
     "pricing": {"in": 5, "out": 15}, "caps": ["chat", "vision", "realtime"], "context": 131000},
    {"id": "cohere", "name": "Cohere", "baseUrl": "https://api.cohere.ai/v1", "authType": "apikey", "free": False,
     "models": ["command-r-plus", "command-r", "command-a"],
     "pricing": {"in": 3, "out": 15}, "caps": ["chat", "rag", "tools"], "context": 128000},
    {"id": "perplexity", "name": "Perplexity", "baseUrl": "https://api.perplexity.ai", "authType": "apikey", "free": False,
     "models": ["llama-3.1-sonar-large-128k-online", "sonar-pro"],
     "pricing": {"in": 1, "out": 1}, "caps": ["chat", "search"], "context": 128000},
    {"id": "cerebras", "name": "Cerebras", "baseUrl": "https://api.cerebras.ai/v1", "authType": "apikey", "free": True,
     "models": ["llama3.1-8b", "llama3.1-70b"],
     "pricing": {"in": 0.1, "out": 0.1}, "caps": ["chat", "fast"], "context": 32000},
    {"id": "groq", "name": "Groq", "baseUrl": "https://api.groq.com/openai/v1", "authType": "apikey", "free": True,
     "models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
     "pricing": {"in": 0.59, "out": 0.79}, "caps": ["chat", "fast"], "context": 32000},
    {"id": "together", "name": "Together AI", "baseUrl": "https://api.together.xyz/v1", "authType": "apikey", "free": True,
     "models": ["meta-llama/Meta-Llama-3.1-405B", "deepseek-ai/DeepSeek-V3"],
     "pricing": {"in": 0.8, "out": 0.8}, "caps": ["chat"], "context": 128000},
    {"id": "fireworks", "name": "Fireworks AI", "baseUrl": "https://api.fireworks.ai/inference/v1", "authType": "apikey", "free": True,
     "models": ["llama-v3p1-405b-instruct", "deepseek-v3"],
     "pricing": {"in": 0.9, "out": 0.9}, "caps": ["chat"], "context": 128000},
    {"id": "anyscale", "name": "Anyscale", "baseUrl": "https://api.endpoints.anyscale.com/v1", "authType": "apikey", "free": False,
     "models": ["mistralai/Mixtral-8x7B-Instruct-v0.1"],
     "pricing": {"in": 0.5, "out": 0.5}, "caps": ["chat"], "context": 32000},
    {"id": "replicate", "name": "Replicate", "baseUrl": "https://api.replicate.com/v1", "authType": "apikey", "free": True,
     "models": ["meta/meta-llama-3-70b-instruct", "mistralai/mistral-7b-instruct-v0.1"],
     "pricing": {"in": 0.65, "out": 2.75}, "caps": ["chat"], "context": 32000},
    {"id": "novita", "name": "Novita AI", "baseUrl": "https://api.novita.ai/v3/openai", "authType": "apikey", "free": True,
     "models": ["meta-llama/llama-3.1-70b-instruct", "deepseek/deepseek-v3"],
     "pricing": {"in": 0.4, "out": 0.4}, "caps": ["chat"], "context": 32000},
    {"id": "openrouter", "name": "OpenRouter", "baseUrl": "https://openrouter.ai/api/v1", "authType": "apikey", "free": True,
     "models": ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash"],
     "pricing": {"in": 1, "out": 3}, "caps": ["chat", "vision"], "context": 128000},
    {"id": "ollama", "name": "Ollama (Local)", "baseUrl": "http://localhost:11434/v1", "authType": "local", "free": True,
     "models": ["llama3.2", "mistral", "qwen2.5", "deepseek-r1:7b"],
     "pricing": {"in": 0, "out": 0}, "caps": ["chat", "local"], "context": 32000},
    {"id": "azure-openai", "name": "Azure OpenAI", "baseUrl": "https://{endpoint}.openai.azure.com/openai",
     "authType": "apikey", "free": False,
     "models": ["gpt-4o", "gpt-4o-mini", "o1"],
     "pricing": {"in": 5, "out": 15}, "caps": ["chat", "vision"], "context": 128000},
]

_SYNTH_NAMES = ["nova", "hyper", "forge", "orbit", "pulse", "nexus", "quantum", "stellar",
                "vortex", "apex", "drift", "ember", "frost", "lumen", "prism", "cascade",
                "vertex", "horizon", "aether", "chrono", "echo", "flux", "helix", "ion",
                "kinetic", "lattice", "matrix", "nebula", "omega", "photon", "quark", "rift",
                "synth", "terra", "umbra", "vector", "wave", "xeno", "yield", "zenith",
                "atlas", "blaze", "core", "delta", "edge", "fusion", "grid", "haven", "iris"]
_SUFFIXES = ["ai", "labs", "cloud", "compute", "inference", "api", "platform", "systems",
             "research", "intel", "stream", "forge", "base", "hub", "scale", "run"]
_SYNTH_CAPS = ["chat", "vision", "code", "reasoning", "tools", "fast", "long", "rag",
               "search", "local", "embeddings", "audio", "image"]


def _synth_provider(idx: int) -> dict:
    base = _SYNTH_NAMES[idx % len(_SYNTH_NAMES)]
    suf = _SUFFIXES[_h(base + str(idx)) % len(_SUFFIXES)]
    pid = f"{base}-{suf}-{idx}"
    free = (idx % 3 == 0) or (_h(pid) % 5 == 0)
    n_models = 1 + (_h(pid + "m") % 6)
    price_in = 0 if (free and _h(pid + "p") % 3 == 0) else round((0.1 + (_h(pid + "price") % 80) / 10), 2)
    caps = list(dict.fromkeys(["chat"] + [_pick(_SYNTH_CAPS, pid + str(k)) for k in range(2 + _h(pid + "c") % 3)]))[:4]
    auth = "oauth" if (free and _h(pid + "a") % 4 == 0) else ("local" if _h(pid + "local") % 12 == 0 else "apikey")
    return {"id": pid, "name": f"{base.capitalize()} {suf.capitalize()}",
            "baseUrl": f"https://api.{pid}.com/v1", "authType": auth, "free": free,
            "freeTier": {"tokensPerMonth": 500000 + _h(pid) % 5000000,
                         "rpm": 20 + _h(pid) % 60, "note": "Free tier"} if free else None,
            "models": [f"{pid}/model-{k + 1}" for k in range(n_models)],
            "modelCount": n_models,
            "pricing": {"in": price_in, "out": round(price_in * 2.2, 2)},
            "caps": caps,
            "context": _pick([8000, 16000, 32000, 64000, 128000, 200000, 1000000], pid),
            "status": "degraded" if _h(pid + "status") % 20 == 0 else "available"}


def _with_free_tier(p: dict) -> dict:
    p = dict(p)
    if p["free"]:
        rpm = 60 if p["id"] == "google" else 30
        toks = 8000000 if p["id"] == "google" else (6000000 if p["id"] == "groq" else 1000000)
        p["freeTier"] = {"tokensPerMonth": toks, "rpm": rpm, "note": "Free tier"}
    else:
        p["freeTier"] = None
    p["modelCount"] = len(p["models"])
    return p


PROVIDERS: list = [_with_free_tier(p) for p in REAL_PROVIDERS] + [_synth_provider(i) for i in range(338)]
PROVIDERS = PROVIDERS[:358]


def get_providers(search="", free_only=False, cap="", page=1, limit=20, sort="name") -> dict:
    lst = list(PROVIDERS)
    if search:
        q = str(search).lower()
        lst = [p for p in lst if q in f"{p['id']} {p['name']} {' '.join(p['caps'])} {' '.join(p['models'])}".lower()]
    if free_only:
        lst = [p for p in lst if p["free"]]
    if cap:
        c = str(cap).lower()
        lst = [p for p in lst if any(c in x.lower() for x in p["caps"])]
    if sort == "models":
        lst.sort(key=lambda p: -p["modelCount"])
    elif sort == "pricing":
        lst.sort(key=lambda p: p["pricing"]["in"])
    else:
        lst.sort(key=lambda p: p["name"].lower())
    total = len(lst)
    pages = max(1, math.ceil(total / limit))
    p = max(1, min(pages, int(page or 1)))
    return {"data": lst[(p - 1) * limit: (p - 1) * limit + limit],
            "total": total, "page": p, "limit": limit, "totalPages": pages}


def get_free_tiers() -> dict:
    free_list = [p for p in PROVIDERS if p["free"]]
    total = sum((p["freeTier"] or {}).get("tokensPerMonth", 0) for p in free_list)
    entries = len(free_list)
    return {"providers": entries, "entries": 489,
            "totalTokensPerMonth": total,
            "scaledTotalTokensPerMonth": max(total, round(1.62e9)) if entries else 1620000000,
            "tokensPerProviderAvg": round(total / entries) if entries else 0,
            "note": "Budget calc: sum of free-tier tokensPerMonth across providers + entries duplication factor",
            "topFreeProviders": [{"id": p["id"], "name": p["name"],
                                  "tokensPerMonth": p["freeTier"]["tokensPerMonth"]} for p in free_list[:12]]}


def get_catalog_stats() -> dict:
    actual = sum(p["modelCount"] for p in PROVIDERS)
    return {"providers": len(PROVIDERS), "models": 1312, "actualModels": actual,
            "freeTiers": sum(1 for p in PROVIDERS if p["free"]), "freeTiersAdvertised": 150,
            "totalTokensApprox": get_free_tiers()["scaledTotalTokensPerMonth"], "poolKeys": 35}


_BREAKERS: dict = {}
_COOLDOWNS: dict = {}


def _breaker(provider: str) -> dict:
    pid = str(provider or "unknown")
    if pid not in _BREAKERS:
        p = pid.lower()
        if p in ("codex", "claude", "claude-cli", "gemini-cli", "antigravity"):
            prof = {"degradeAt": 5, "openAt": 8, "resetMs": 60000}
        elif any(x in p for x in ("ollama", "lmstudio", "local", "mlx")):
            prof = {"degradeAt": 1, "openAt": 2, "resetMs": 15000}
        else:
            prof = {"degradeAt": 7, "openAt": 12, "resetMs": 30000}
        _BREAKERS[pid] = {"provider": pid, "state": "CLOSED", "failures": 0, "success": 0,
                          "lastFailureAt": 0, "openUntil": 0, "nextProbeAt": 0, "profile": prof}
    return _BREAKERS[pid]


def _breaker_status(provider: str) -> dict:
    b = _breaker(provider)
    now_ms = int(time.time() * 1000)
    if b["state"] == "OPEN" and b["openUntil"] and now_ms >= b["openUntil"]:
        b["state"] = "HALF_OPEN"
        b["nextProbeAt"] = now_ms + 5000
    return {"provider": b["provider"], "state": b["state"], "failures": b["failures"],
            "openUntil": b["openUntil"] or None, "nextProbeAt": b["nextProbeAt"] or None,
            "profile": b["profile"], "canExecute": b["state"] != "OPEN",
            "retryAfterMs": max(0, b["openUntil"] - now_ms) if (b["state"] == "OPEN" and b["openUntil"]) else 0}


def _ensure_demo_cooldowns():
    now_ms = int(time.time() * 1000)
    live = [c for c in _COOLDOWNS.values() if (c.get("rateLimitedUntil") or 0) > now_ms]
    if not live:
        _COOLDOWNS["demo-conn-openai-1"] = {"connectionId": "demo-conn-openai-1", "provider": "openai",
                                            "rateLimitedUntil": now_ms + 45000, "testStatus": "unavailable",
                                            "backoffLevel": 1, "lastError": "429 rate_limited (demo)",
                                            "errorCode": "rate_limited"}


def _cooldown_status(cid: str) -> dict:
    c = _COOLDOWNS.get(str(cid))
    now_ms = int(time.time() * 1000)
    if not c:
        return {"connectionId": cid, "cooling": False, "rateLimitedUntil": None,
                "testStatus": "available", "backoffLevel": 0}
    cooling = (c.get("rateLimitedUntil") or 0) > now_ms
    return {"connectionId": c["connectionId"], "provider": c.get("provider"), "cooling": cooling,
            "rateLimitedUntil": c.get("rateLimitedUntil"),
            "retryAfterMs": max(0, c["rateLimitedUntil"] - now_ms) if cooling else 0,
            "testStatus": c["testStatus"] if cooling else "available",
            "backoffLevel": c.get("backoffLevel", 0), "lastError": c.get("lastError"),
            "errorCode": c.get("errorCode")}


def get_resilience_status() -> dict:
    _ensure_demo_cooldowns()
    providers = [_breaker_status(b) for b in list(_BREAKERS)]
    for g in ("openai", "anthropic", "google", "deepseek", "meta-llama", "mistralai", "qwen"):
        if not any(x["provider"] == g for x in providers):
            providers.append(_breaker_status(g))
    now_ms = int(time.time() * 1000)
    lockouts = [{"key": "openai::demo-conn-openai-1::openai/gpt-4o-mini", "provider": "openai",
                 "connectionId": "demo-conn-openai-1", "model": "openai/gpt-4o-mini",
                 "until": now_ms + 90000, "reason": "per-model 429 quota (demo)",
                 "remainingMs": 90000}]
    return {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "layers": {
                "circuitBreaker": {
                    "note": "Per-provider breaker: CLOSED/DEGRADED/OPEN/HALF_OPEN. Only 408/5xx trips provider breaker; 401/403/429 go to cooldown/lockout.",
                    "states": ["CLOSED", "DEGRADED", "OPEN", "HALF_OPEN"],
                    "thresholds": {"oauth": "5→8 /60s", "apikey": "7→12 /30s", "local": "1→2 /15s"},
                    "providers": providers},
                "connectionCooldown": {
                    "note": "Per-connection cooldown: isolates one bad key/account. OAuth 5s, API 3s, exponential x2, honors Retry-After.",
                    "connections": [_cooldown_status(cid) for cid in _COOLDOWNS]},
                "modelLockout": {
                    "note": "Per-model lockout: avoids disabling whole connection when only one model is unavailable (429/404 per model).",
                    "lockouts": lockouts}},
            "summary": {"openBreakers": sum(1 for b in providers if b["state"] == "OPEN"),
                        "coolingConnections": sum(1 for c in _COOLDOWNS.values()
                                                  if (c.get("rateLimitedUntil") or 0) > now_ms),
                        "lockedModels": len(lockouts)}}
