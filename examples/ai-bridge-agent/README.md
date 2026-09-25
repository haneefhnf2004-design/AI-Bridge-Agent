# AI Bridge Agent V2

> **Universal AI bridge** — extract any conversation from **ChatGPT / Gemini / Claude / Perplexity** and continue it on **Bridge Engine** (Universal AI Network · 1000+ chat models · 1.62B free tokens/month · 19 combo routing strategies · 16-factor Auto-Combo · 3-layer resilience · RTK+Caveman compression).

![Bridge Engine](https://img.shields.io/badge/Bridge Engine-300+%20providers-7c3aed?style=for-the-badge)
![Models](https://img.shields.io/badge/models-1000+-06b6d4?style=for-the-badge)
![Free Tokens](https://img.shields.io/badge/free-1.62B%20tokens%2Fmo-f59e0b?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-MV3-4285f4?style=flat-square&logo=googlechrome)

**No limited AI tools.** No “pick 1 of 300 on OpenRouter”. Bridge Engine is the routing *fabric* — `auto`, `auto/coding`, `auto/fast`, `auto/cheap`, `auto/long-context`, `fusion`.

---

## ✨ What it does

| Step | Action |
|------|--------|
| **1** | User chats anywhere (ChatGPT / Gemini / Claude / Perplexity) |
| **2** | Click **AI Bridge Agent** (popup or context menu → *Continue in Bridge Engine*) |
| **3** | Universal extractor pulls the full conversation (adaptive selectors + lazy-load + generic fallback) |
| **4** | Smart Memory Engine: `cleanFormat → RTK/Caveman optimize → summarizeIfNeeded` |
| **5** | Smart AI Router: `analyzeQueryType → 16-factor scorer → best model` |
| **6** | Call **Bridge Engine** at `/api/chat/completions` (backend proxy fallback + mock) |
| **7** | Stream result back, save history, continue the thread anywhere |

**Works even if Bridge Engine is offline** — deterministic mock lets you test the whole pipeline with zero keys.

---

## 🖼️ Screenshots

> Placeholder — replace with actual captures after loading the extension

| Popup | Dashboard | Transfer |
|-------|-----------|----------|
| ![popup](docs/screenshot-popup.png) | ![dashboard](docs/screenshot-dashboard.png) | ![transfer](docs/screenshot-transfer.png) |

Poster source: `docs/AI_BRIDGE_AGENT_V2.html` (premium dark neon merged roadmap).

---

## 🏗️ Architecture

```mermaid
flowchart LR
  subgraph Browser[Chrome MV3 Extension]
    CS[Content Scripts\n extractor + site adapters]
    BG[Background SW\n service-worker]
    POP[Popup\n neon glass UI]
    CM[Context Menu\n Continue in...]
    CS --> BG
    POP --> BG
    CM --> BG
  end

  subgraph Backend[Backend :8787]
    MEM[Memory Engine\n clean / RTK+Caveman / summarize]
    ROUT[Router Engine\n 16-factor scorer]
    PROXY[Bridge Engine Proxy\n retry + circuit breaker]
    MEM --> ROUT --> PROXY
  end

  subgraph Bridge Engine[Bridge Engine ]
    R1[Universal AI Network]
    R2[1000+ Models]
    R3[19 Combo Strategies]
    R4[1.62B free tok/mo]
  end

  CS -- extract messages --> BG
  BG -- POST /api/transfer --> Backend
  Backend -- POST /v1/chat/completions --> Bridge Engine
  Bridge Engine -- completion --> Backend --> BG --> POP
  Backend -- static --> DASH[Web Dashboard\n /dashboard]

  style Browser fill:#0d1022,stroke:#7c3aed
  style Backend fill:#111636,stroke:#3b82f6
  style Bridge Engine fill:#06101a,stroke:#06b6d4
```

**6-Phase Roadmap (poster)**

```
Foundation → Core Bridge → Bridge Engine Fabric → Memory & Routing → Extension Polish → SaaS
     +  OpenRouter 5-step reimagined as Bridge Engine 5-step: Get API Key → Launch Agent (any of 1000+ models)
```

---

## 📦 Project Layout

```
AI-Bridge-Agent/
├── extension/
│   ├── manifest.json                 # MV3, host_permissions, action popup
│   ├── icons/icon{16,32,48,128}.png
│   └── src/
│       ├── background/service-worker.js
│       ├── content/
│       │   ├── extractor.js          # universal orchestrator (lazy-load, metadata)
│       │   ├── generic.js            # ultra-resilient fallback
│       │   ├── chatgpt.js            # [data-message-author-role]
│       │   ├── gemini.js             # user-query / model-response
│       │   ├── claude.js             # [data-testid=user-message]
│       │   └── perplexity.js         # prose / answer blocks
│       ├── utils/
│       │   ├── bridge-client.js   # callBridge Engine + health + retry + mock
│       │   ├── memory-engine.js      # clean / summarize / RTK+Caveman / vector store
│       │   └── router.js             # analyzeQueryType + selectBestModel
│       └── popup/
│           ├── popup.html
│           ├── popup.css             # dark neon, glassmorphism, gradients
│           └── popup.js
├── backend/
│   ├── server.js                     # Express :8787  /api/*  /v1/*  static dashboard
│   ├── package.json
│   └── src/services/
│       ├── memoryEngine.js
│       ├── routerEngine.js           # 16-factor scorer (deterministic)
│       └── bridgeProxy.js         # fetch + timeout + circuit breaker
├── web-dashboard/
│   ├── index.html                    # standalone tester (no extension needed)
│   ├── app.js
│   └── app.css
├── docs/
│   └── AI_BRIDGE_AGENT_BRIDGE_V2.html
├── package.json                      # workspaces
└── README.md
```

---

## 🚀 Quickstart

### Prereqs

- Node.js ≥ 18
- Chrome / Edge / Brave (MV3)
- Bridge Engine running at `/api` (optional — mock fallback works without it)

### 1) Install & run backend + dashboard

```bash
cd AI-Bridge-Agent
npm install
npm --workspace backend install
npm --workspace backend run dev
# → http://localhost:8787
# → http://localhost:8787/dashboard
# → API: http://localhost:8787/api/health  /api/models  POST /api/transfer
```

Env (optional) — `backend/.env`:

```
PORT=8787
BRIDGE_BASE=/api
```

### 2) Start Bridge Engine (for real completions)

```bash
# from your Bridge Engine release
bridge-engine serve
# serves at /api  (verify: curl /api/models)
```

If Bridge Engine is not running, the backend and extension automatically use a **clearly-labeled mock** so the whole flow is testable.

### 3) Load the Chrome Extension

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `AI-Bridge-Agent/extension`
3. Open any of:
   - `https://chat.openai.com` / `https://chatgpt.com`
   - `https://gemini.google.com`
   - `https://claude.ai`
   - `https://perplexity.ai`
4. Click the extension icon → **Re-extract** → choose target (default `AUTO`) → **⚡ Transfer via Bridge Engine**
5. Or right-click page → **Continue in Bridge Engine — AUTO**

### 4) Try without the extension (dashboard)

1. Open `http://localhost:8787`
2. Pick **Load Example** or paste your own `messages[]` JSON
3. Choose target model → **Transfer via Bridge Engine** → copy result

---

## 🔌 API Docs

### `GET /api/health`

```json
{
  "ok": true,
  "service": "ai-bridge-backend",
  "bridge_ok": true,
  "bridge": { "ok": true, "count": 1000 },
  "at": "2026-..."
}
```

### `GET /api/models`

Returns ` { data: [{id, name, provider}], source: "bridge"|"curated-fallback", count }`. Also available at `GET /v1/models` (Bridge-compatible).

### `POST /api/transfer`

**Request**

```json
{
  "messages": [{ "role": "user", "content": "hello" }, { "role": "assistant", "content": "hi" }],
  "model": "auto",
  "temperature": 0.7,
  "max_tokens": 2048
}
```

`model` supports: `auto`, `auto/coding`, `auto/fast`, `auto/cheap`, `auto/long-context`, `fusion`, or explicit `provider/model` like `openai/gpt-4o`.

**Response**

```json
{
  "content": "...assistant text...",
  "model": "openai/gpt-4o",
  "provider": "bridge",
  "usage": { "prompt_tokens": 123, "completion_tokens": 45 },
  "fallback": false,
  "routing": { "task": "coding", "selector": "auto", "chosen": "deepseek/deepseek-v3", "explanation": "..." },
  "memory": { "originalTokens": 842, "finalTokens": 610, "summarized": true }
}
```

If Bridge Engine is offline, `fallback: true`, `provider: "mock"`, and `content` starts with `[MOCK — Bridge Engine offline]`.

### `POST /v1/chat/completions` (Bridge-compatible)

Same as above, returns OpenAI-compatible `{ id, object:"chat.completion", choices:[{message:{role,content}}], usage }`.

---

## 🧠 Engines

### Smart Memory Engine

- `cleanFormat` — dedupe, strip UI chrome, clamp 14k/msg
- `optimizeTokens(level="rtk"|"caveman")` — deterministic phrase shortening, filler removal
- `summarizeIfNeeded(budget=6000)` — keep head(2) + tail(24), extractive summarize middle, report `savedTokens`
- `maintainContext` — `chrome.storage.local` vector-like ring buffer (20 entries)

### Smart AI Router

- `analyzeQueryType(messages)` — regex heuristics: `coding / reasoning / long-context / fast / creative / vision / general`
- `selectBestModel(type)` — `auto/coding`, `auto/fast`, `auto/cheap`, `auto/long-context`, `fusion`
- **Backend 16-factor scorer**: `quality, coding, latency, cost, window, reliability, freshness, vision, free, jitter…` → ranked list + explanation. Deterministic, no API.

### Bridge Client

- Primary: `/api/chat/completions`
- Fallback 1: `http://localhost:8787/api/transfer`
- Fallback 2: deterministic mock with actionable error
- `fetchWithTimeout`, 2 retries, circuit breaker (3 failures → 15s cooldown)

---

## 🎨 UI Theme

- Background `#060818`, cards `#0d1022` / `#111636`, borders `#1e2450`
- Gradients: purple `#7c3aed` → blue `#3b82f6` → cyan `#06b6d4` → gold `#f59e0b`
- Glassmorphism, neon orb, pill badges, animated progress bar
- Poster parity: `docs/AI_BRIDGE_AGENT_V2.html`

---

## 🛠️ Tech Stack

- **Extension**: Manifest V3, ES2022 modules, `chrome.storage`, `chrome.tabs`, `chrome.contextMenus`
- **Backend**: Node 18+, Express 4, CORS, dotenv, native `fetch` (no extra deps)
- **Dashboard**: Vanilla JS (no build), same neon theme, `fetch` to backend
- **No bundler required** for v2 — load unpacked directly

---

## 🔒 Permissions Justification

- `activeTab` + `scripting` — inject extractor into the active AI chat tab only
- `storage` — persist history + vector-like memory ring
- `tabs` — query active tab for extraction
- `host_permissions` — `chat.openai.com`, `chatgpt.com`, `gemini.google.com`, `claude.ai`, `perplexity.ai`, `bridge-engine`, `localhost:8787`

No `<all_urls>`, no remote code, no `eval`.

---

## 🧪 Verify

```bash
# files exist
ls extension/manifest.json extension/src/popup/popup.html backend/server.js web-dashboard/index.html

# backend health (after npm run dev)
curl http://localhost:8787/api/health
curl http://localhost:8787/api/models | head -c 400

# direct transfer (mock OK without Bridge Engine)
curl -X POST http://localhost:8787/api/transfer \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello from dashboard"}],"model":"auto"}'

# extension: chrome://extensions → Load unpacked → extension/
```

---

## 📄 License

MIT — AI Bridge Labs. Built for the ver-level.

---

## 🙏 Credits

- AI Bridge — the fabric that makes “any model, any provider, one API” real
- Roadmap poster: 6-phase AI Bridge Agent × OpenRouter 5-step → **Bridge Engine 5-step (Get Key → Launch Agent)**
