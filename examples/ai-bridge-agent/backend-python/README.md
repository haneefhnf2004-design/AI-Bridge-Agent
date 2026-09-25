# AI Bridge Engine — Python backend (FastAPI mirror of the Node Express backend)

Full Python FastAPI mirror of `../backend` (Node Express). New folder — the Node backend is untouched.

## Install

```bash
cd backend-python
pip install -r requirements.txt
```

Requires Python 3.10+.

## Run

```bash
uvicorn app:app --port 8788
```

Default port is **8788** (via `PORT` env) to avoid clashing with the Node backend on `8787`.
Set `BRIDGE_BASE` env to point at a live Bridge Engine (default `http://localhost:20128/v1`);
when unreachable, the built-in intelligent mock answers.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | service, bridge status, model count |
| GET | `/api/models` | bridge list or curated fallback |
| GET | `/v1/models` | OpenAI-shape list |
| POST | `/api/transfer` | memory pipeline + routing + bridge/mock reply |
| POST | `/v1/chat/completions` | OpenAI-shape completion |
| GET | `/api/strategies` | 19 combo strategies |
| GET | `/api/compression/engines` | 12 compression engines |
| POST | `/api/compress` | `{text, level}` → compressed |
| GET | `/api/resilience/status` | 3-layer breaker/cooldown/lockout |
| GET | `/api/mcp/tools` | 110-tool registry (`scope, category, search, limit, offset`) |
| POST | `/api/mcp/call` | `{name\|tool, arguments\|args}` |
| POST | `/api/a2a` | JSON-RPC 2.0 or `{skill, params}`; 6 skills |
| POST | `/api/guardrails/check` | PII + injection + vision report |
| GET | `/api/providers` | 358 providers (`search, free, cap, page, limit, sort`) |
| GET | `/api/free-tiers` | free-tier budget roll-up |
| GET | `/ /chat /models /model-detail /providers /resilience /mcp` (+`.html`) | serves `../web-dashboard/*.html` |
| GET | `/dashboard/` | static dashboard mount |

`POST /api/transfer` response shape matches Node:

```json
{
  "content": "...", "model": "auto", "provider": "ai-bridge",
  "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
  "fallback": false,
  "routing": {"task": "general", "selector": "auto", "chosen": "...", "explanation": "...", "ranked": []},
  "memory": {"originalCount": 1, "finalCount": 1, "...": "..."},
  "guardrails": null
}
```

Open the dashboard via the served pages, e.g. `http://localhost:8788/chat`
(the API base is same-origin, so no CORS setup needed).

## Parity notes vs Node backend

- Same routes, same JSON field names (`provider: "ai-bridge"`, `fallback`, `routing{task,selector,chosen,explanation}`, `memory`, `usage`).
- Intelligent mock keeps the same intent order and trilingual (Tamil/Hindi/English) replies;
  language table compressed to 20 core languages (Node carries ~100+); Tamil/Hindi/Sinhala
  word dictionaries retained.
- Router keeps the 12-model 16-factor scorer with identical weights; strategy *execution*
  (`applyStrategy`) is list-only here — `/api/strategies` returns the 19 names/descs as Node does.
- Memory pipeline: clean → compress-level → summarize, same stats fields.
- Resilience `/api/resilience/status` returns live breaker/cooldown shapes plus one demo
  cooling connection and one demo model lockout (Node seeds the same demos).
- MCP registry totals 110 tools with identical canonical names; synthetic fillers match Node's
  `{category}_tool_{n}` scheme. A2A exposes the same 6 skills over JSON-RPC 2.0.
- Math evaluation uses `ast` parsing (no `eval`/`Function`); only arithmetic nodes allowed.
- No OmniRoute branding — service strings use "AI Bridge Engine"/"ai-bridge".
