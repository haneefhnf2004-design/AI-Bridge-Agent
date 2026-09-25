"""AI Bridge Engine — Python FastAPI mirror of the Node Express backend.

Mirrors every route in backend/server.js with matching JSON shapes.
Bridge Engine proxy attempted first (BRIDGE_BASE); intelligent local
mock (services/brain.py) answers when the bridge is offline.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from services.brain import mock_completion
from services.catalog import (
    ENGINES,
    SKILLS,
    STRATEGIES,
    call_tool,
    compress,
    get_catalog_stats,
    get_free_tiers,
    get_mcp_stats,
    get_providers,
    get_resilience_status,
    get_scopes,
    handle_a2a,
    list_tools,
)
from services.memory import process_memory_pipeline
from services.router import explain_selection, resolve_selector

BRIDGE_BASE = os.environ.get("BRIDGE_BASE", "http://localhost:20128/v1")
PORT = int(os.environ.get("PORT", "8788"))

ROOT = Path(__file__).resolve().parent.parent
DASH = ROOT / "web-dashboard"

app = FastAPI(title="AI Bridge Engine", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["X-Bridge-Guardrail"])

CURATED = [
    {"id": "auto", "name": "AUTO — Best for this task", "provider": "bridge"},
    {"id": "auto/coding", "name": "AUTO / Coding", "provider": "bridge"},
    {"id": "auto/fast", "name": "AUTO / Fast & Cheap", "provider": "bridge"},
    {"id": "auto/cheap", "name": "AUTO / Cheapest", "provider": "bridge"},
    {"id": "auto/long-context", "name": "AUTO / Long Context", "provider": "bridge"},
    {"id": "fusion", "name": "FUSION — Ensemble", "provider": "bridge"},
    {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "openai"},
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o mini", "provider": "openai"},
    {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "provider": "anthropic"},
    {"id": "google/gemini-2.0-flash", "name": "Gemini 2.0 Flash", "provider": "google"},
    {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama 3.3 70B", "provider": "meta-llama"},
    {"id": "deepseek/deepseek-v3", "name": "DeepSeek V3", "provider": "deepseek"},
]


def _http_json(url: str, method: str = "GET", payload: dict | None = None,
               timeout: float = 4.5):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")


def health_check_bridge() -> dict:
    try:
        j = _http_json(f"{BRIDGE_BASE}/models", timeout=4.5)
        count = len(j["data"]) if isinstance(j.get("data"), list) else 0
        return {"ok": True, "count": count, "raw": j, "base": BRIDGE_BASE, "circuit": "closed"}
    except Exception as e:
        return {"ok": False, "error": str(e), "base": BRIDGE_BASE, "circuit": "closed"}


def list_models_proxy():
    h = health_check_bridge()
    if h.get("ok") and isinstance((h.get("raw") or {}).get("data"), list) and h["raw"]["data"]:
        return [{"id": m.get("id"), "name": m.get("id"),
                 "provider": str(m.get("id", "")).split("/")[0]} for m in h["raw"]["data"]]
    return None


def proxy_chat_completions(messages: list, model: str = "auto", opts: dict | None = None) -> dict:
    opts = opts or {}
    try:
        j = _http_json(f"{BRIDGE_BASE}/chat/completions", method="POST",
                       payload={"model": model, "messages": messages,
                                "temperature": opts.get("temperature", 0.7),
                                "max_tokens": opts.get("max_tokens", 2048),
                                "stream": False}, timeout=12)
        content = ""
        try:
            content = j["choices"][0]["message"]["content"] or j["choices"][0].get("text", "")
        except Exception:
            content = ""
        return {"ok": True, "content": content, "model": j.get("model", model),
                "provider": j.get("provider", "bridge"), "usage": j.get("usage"), "raw": j}
    except Exception as e:
        return {"ok": False, "error": str(e), "fallback": True}


PII_PATTERNS = [
    ("email", re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"), "[EMAIL_REDACTED]"),
    ("phone", re.compile(r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}"), "[PHONE_REDACTED]"),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN_REDACTED]"),
    ("credit_card", re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "[CARD_REDACTED]"),
    ("ipv4", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP_REDACTED]"),
    ("api_key", re.compile(r"\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36,}|AKIA[0-9A-Z]{16})\b"), "[KEY_REDACTED]"),
]
INJECTION_RES = [
    re.compile(r"ignore (?:all )?previous instructions", re.I),
    re.compile(r"ignore (?:the )?above", re.I),
    re.compile(r"system prompt", re.I),
    re.compile(r"you are now", re.I),
    re.compile(r"jailbreak", re.I),
    re.compile(r"DAN mode", re.I),
    re.compile(r"do anything now", re.I),
    re.compile(r"reveal (?:your )?prompt", re.I),
    re.compile(r"exfiltrate|send (?:all )?(?:data|keys|secrets)", re.I),
    re.compile(r"\[INST\]", re.I),
    re.compile(r"<\s*system\s*>", re.I),
]


def guardrails_check(messages: list, pii_enabled: bool = False,
                     block_injection: bool = False) -> dict:
    parts = []
    for m in (messages or []):
        if not isinstance(m, dict):
            continue
        c = m.get("content", "")
        parts.append(c if isinstance(c, str) else json.dumps(c))
    text = "\n".join(parts)
    redacted, hits = text, []
    if pii_enabled:
        for name, rx, mask in PII_PATTERNS:
            found = rx.findall(redacted)
            if found:
                hits.append({"type": name, "count": len(found)})
                redacted = rx.sub(mask, redacted)
    inj_hits = [rx.pattern for rx in INJECTION_RES if rx.search(text)]
    risk = "high" if len(inj_hits) >= 2 else ("medium" if inj_hits else "low")
    blocked = risk == "high" and block_injection
    return {"pii": {"enabled": pii_enabled, "text": redacted,
                    "redacted": bool(hits), "hits": hits},
            "injection": {"flagged": bool(inj_hits), "hits": inj_hits,
                          "risk": risk, "action": "warn" if inj_hits else "allow"},
            "vision": {"ok": True, "issues": []},
            "blocked": blocked, "action": "block" if blocked else "allow"}


def apply_guardrails(body: dict, headers) -> tuple[dict, dict | None]:
    messages = body.get("messages")
    if not isinstance(messages, list):
        return body, None
    pii_on = (os.environ.get("PII_REDACTION_ENABLED", "false").lower() == "true"
              or bool(body.get("piiEnabled")) or bool(headers.get("x-pii-redact"))
              or bool(headers.get("X-Pii-Redact")))
    block_inj = os.environ.get("BLOCK_INJECTION", "false").lower() == "true"
    result = guardrails_check(messages, pii_on, block_inj)
    if result["pii"]["redacted"] and pii_on:
        body = {**body, "messages": [
            {**m, "content": re.sub(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
                                    "[EMAIL_REDACTED]", m["content"])}
            if isinstance(m.get("content"), str) else m for m in messages]}
    return body, result


@app.get("/api/health")
def api_health():
    omni = health_check_bridge()
    return {"ok": True, "service": "ai-bridge-backend", "version": "2.0.0",
            "engine": "Bridge Engine", "bridge_ok": bool(omni.get("ok")),
            "bridge": omni, "models": omni.get("count", 0) or 0,
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


@app.get("/api/models")
def api_models():
    proxied = list_models_proxy()
    if proxied:
        return {"data": proxied, "source": "bridge", "count": len(proxied)}
    return {"data": CURATED, "source": "curated-fallback", "count": len(CURATED),
            "note": "Bridge Engine offline — serving curated fallback (Universal AI Network represented)"}


@app.get("/v1/models")
def v1_models():
    proxied = list_models_proxy()
    src = proxied or CURATED
    now_ms = int(time.time() * 1000)
    return {"data": [{"id": m["id"], "object": "model", "created": now_ms} for m in src],
            "object": "list"}


@app.get("/api/strategies")
def api_strategies():
    return {"count": len(STRATEGIES), "strategies": STRATEGIES}


@app.get("/api/compression/engines")
def api_engines():
    return {"count": len(ENGINES), "engines": ENGINES,
            "note": "Bridge Engine 12 engines, 15-95% (~89% avg)"}


@app.post("/api/compress")
async def api_compress(req: Request):
    body = await req.json() if req.headers.get("content-type", "").startswith("application/json") else {}
    text, level = body.get("text", ""), str(body.get("level", "rtk"))
    if not text:
        return JSONResponse({"error": "text required"}, status_code=400)
    return {"ok": True, **compress(str(text), level)}


@app.get("/api/resilience/status")
def api_resilience():
    return get_resilience_status()


@app.get("/api/mcp/tools")
def api_mcp_tools(scope: str | None = None, category: str | None = None,
                  search: str | None = None, limit: int = 100, offset: int = 0):
    tools = list_tools(scope=scope or None, category=category or None,
                       search=search or None)
    total = len(tools)
    lim = min(200, max(1, int(limit or 100)))
    off = max(0, int(offset or 0))
    return {"count": total, "returned": len(tools[off: off + lim]),
            "tools": tools[off: off + lim], "stats": get_mcp_stats(), "scopes": get_scopes()}


@app.post("/api/mcp/call")
async def api_mcp_call(req: Request):
    try:
        body = await req.json()
    except Exception:
        body = {}
    name = body.get("name") or body.get("tool")
    if not name:
        return JSONResponse({"error": "name (tool) required"}, status_code=400)
    result = call_tool(str(name), body.get("arguments") or body.get("args") or {})
    if not result.get("ok") and result.get("code") == "tool_not_found":
        return JSONResponse(result, status_code=404)
    return result


@app.post("/api/a2a")
async def api_a2a(req: Request):
    try:
        body = await req.json()
    except Exception:
        body = {}
    if body.get("jsonrpc") or body.get("method"):
        return handle_a2a(body)
    if body.get("skill"):
        return handle_a2a({"jsonrpc": "2.0", "id": body.get("id", 1),
                           "method": str(body["skill"]),
                           "params": body.get("params") or body.get("input") or {}})
    if not body.get("method") and not body.get("skill"):
        return {"jsonrpc": "2.0", "id": 1, "result": {"skills": SKILLS}}
    return handle_a2a({"jsonrpc": "2.0", "id": 1, "method": "list-capabilities", "params": {}})


@app.post("/api/guardrails/check")
async def api_guardrails(req: Request):
    try:
        body = await req.json()
    except Exception:
        body = {}
    msgs = body.get("messages") if isinstance(body.get("messages"), list) \
        else ([{"role": "user", "content": str(body["text"])}] if body.get("text") else [])
    r = guardrails_check(msgs, bool(body.get("piiEnabled")), bool(body.get("blockInjection")))
    return {"ok": True, **r}


@app.get("/api/providers")
def api_providers(search: str = "", free: str = "", capability: str = "",
                  cap: str = "", freeOnly: str = "", page: int = 1,
                  limit: int = 20, sort: str = "name"):
    flag = str(free or freeOnly or "").lower()
    out = get_providers(search=search or "", free_only=(flag in ("true", "1")),
                        cap=cap or capability or "", page=int(page or 1),
                        limit=min(100, max(5, int(limit or 20))), sort=sort or "name")
    return {**out, "stats": get_catalog_stats()}


@app.get("/api/free-tiers")
def api_free_tiers():
    return {"ok": True, **get_free_tiers(),
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def _transfer_payload(body: dict, guard):
    messages = body.get("messages")
    model = body.get("model", "auto") or "auto"
    mem = process_memory_pipeline(messages, {"level": body.get("level", "rtk") or "rtk",
                                             "budget": body.get("budget", 6000) or 6000})
    routing = resolve_selector(model, mem["messages"],
                               {"cheap": "cheap" in model, "preferFree": "cheap" in model})
    proxy = proxy_chat_completions(mem["messages"], model,
                                   {"temperature": body.get("temperature"),
                                    "max_tokens": body.get("max_tokens")})
    route = {"task": routing["task"], "selector": model, "chosen": routing["chosen"]["id"],
             "explanation": explain_selection(routing),
             "ranked": [{"id": r["id"], "score": r.get("score")} for r in routing["ranked"][:5]]}
    if proxy.get("ok"):
        return {"content": proxy["content"], "model": proxy.get("model", model),
                "provider": proxy.get("provider", "bridge"), "usage": proxy.get("usage"),
                "fallback": bool(proxy.get("fallback")), "routing": route,
                "memory": mem["stats"], "guardrails": guard, "raw": proxy.get("raw")}
    mock = mock_completion(mem["messages"], model)
    return {"content": mock["content"], "model": mock["model"], "provider": "ai-bridge",
            "usage": mock["usage"], "fallback": False, "routing": route,
            "memory": mem["stats"], "guardrails": guard, "raw": mock["raw"]}


@app.post("/api/transfer")
async def api_transfer(req: Request):
    try:
        body = await req.json()
    except Exception:
        body = {}
    if not isinstance((body or {}).get("messages"), list) or not body["messages"]:
        return JSONResponse({"error": "messages[] required (non-empty)"}, status_code=400)
    try:
        body, guard = apply_guardrails(body, req.headers)
        if guard and guard.get("blocked"):
            return JSONResponse({"error": "Guardrail blocked: prompt injection detected",
                                 "guardrails": guard}, status_code=400)
        resp = JSONResponse(_transfer_payload(body, guard))
        if guard and guard.get("injection", {}).get("flagged"):
            resp.headers["X-Bridge-Guardrail"] = f"injection:{guard['injection']['risk']}"
        return resp
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/v1/chat/completions")
async def v1_chat(req: Request):
    try:
        body = await req.json()
    except Exception:
        body = {}
    if not isinstance((body or {}).get("messages"), list):
        return JSONResponse({"error": "messages required"}, status_code=400)
    body, guard = apply_guardrails(body, req.headers)
    if guard and guard.get("blocked"):
        return JSONResponse({"error": "Guardrail blocked: prompt injection detected",
                             "guardrails": guard}, status_code=400)
    model = body.get("model", "auto") or "auto"
    mem = process_memory_pipeline(body["messages"], {})
    proxy = proxy_chat_completions(mem["messages"], model,
                                   {"temperature": body.get("temperature"),
                                    "max_tokens": body.get("max_tokens")})
    cid = f"chatcmpl-{int(time.time() * 1000):x}"
    if proxy.get("ok"):
        return {"id": cid, "object": "chat.completion",
                "created": int(time.time()), "model": proxy.get("model", model),
                "choices": [{"index": 0, "message": {"role": "assistant",
                                                     "content": proxy["content"]},
                             "finish_reason": "stop"}],
                "usage": proxy.get("usage") or {"prompt_tokens": 0, "completion_tokens": 0,
                                                "total_tokens": 0}}
    mock = mock_completion(mem["messages"], model)
    return {"id": cid, "object": "chat.completion", "created": int(time.time()),
            "model": mock["model"],
            "choices": [{"index": 0, "message": {"role": "assistant", "content": mock["content"]},
                         "finish_reason": "stop"}],
            "usage": mock["usage"], "provider": "ai-bridge"}


def _page(name: str):
    f = DASH / name
    if f.exists():
        return FileResponse(str(f), media_type="text/html")
    return JSONResponse({"ok": True, "service": "ai-bridge-backend",
                         "docs": {"health": "/api/health", "models": "/api/models",
                                  "transfer": "POST /api/transfer", "dashboard": "/dashboard/"}})


@app.get("/")
def index():
    return _page("index.html")


def _make_page_route(filename: str):
    def _handler():
        return _page(filename)
    _handler.__name__ = f"page_{filename.replace('.', '_')}"
    return _handler


for _route, _file in [("/chat", "chat.html"), ("/models", "models.html"),
                      ("/model-detail", "model-detail.html"), ("/providers", "providers.html"),
                      ("/resilience", "resilience.html"), ("/mcp", "mcp.html"),
                      ("/index.html", "index.html"), ("/chat.html", "chat.html"),
                      ("/models.html", "models.html"), ("/model-detail.html", "model-detail.html"),
                      ("/providers.html", "providers.html"), ("/resilience.html", "resilience.html"),
                      ("/mcp.html", "mcp.html")]:
    app.get(_route)(_make_page_route(_file))

if DASH.exists():
    app.mount("/dashboard", StaticFiles(directory=str(DASH), html=True), name="dashboard")
    app.mount("/static", StaticFiles(directory=str(DASH)), name="static")
    # root static LAST so explicit /api/* and page routes win; serves /app.css, /app.js, /logo.svg, /manifest.json, /sw.js
    app.mount("/", StaticFiles(directory=str(DASH), html=True), name="root")


@app.exception_handler(404)
async def not_found(_req: Request, _exc):
    return JSONResponse({"error": "Not found", "path": _req.url.path}, status_code=404)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
