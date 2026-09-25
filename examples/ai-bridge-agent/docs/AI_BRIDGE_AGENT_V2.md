# AI Bridge Agent V2 · Merged Roadmap

> **6-Phase AI Bridge Agent + OpenRouter 5-Step → Bridge Engine 5-Step** · Premium poster parity doc

---

## Vision

> Don't use limited AI tools (ChatGPT / Gemini / Claude / Perplexity) *or* OpenRouter's 300 models as the destination. **Use Bridge Engine as the fabric** — Universal AI Network, 1000+ chat models, 1.62B free tokens/month, 19 combo routing strategies, 16-factor Auto-Combo, 3-layer resilience, RTK+Caveman compression.

---

## 6-Phase Roadmap (Foundation → SaaS)

| Phase | Name | Outcome |
|-------|------|---------|
| **1** | **Foundation** | Universal extractor (ChatGPT/Gemini/Claude/Perplexity) + Manifest V3 shell |
| **2** | **Core Bridge** | One-click transfer: extract → clean → route → Bridge Engine → result |
| **3** | **Bridge Engine Fabric** | Universal AI Network / 1000+ models / 1.62B free tok/mo — `auto`, `auto/coding`, `auto/fast`, `fusion` |
| **4** | **Memory & Routing** | Smart Memory Engine (RTK+Caveman) + 16-factor scorer + 19 combo strategies |
| **5** | **Extension Polish** | Neon glass UI, context menu *Continue in…*, history, health, resilience |
| **6** | **SaaS** | Hosted dashboard, team workspaces, usage metering, enterprise SSO |

---

## Bridge Engine 5-Step (replaces OpenRouter 5-Step)

```
Image2 (OpenRouter):  Get API Key → Pick Model (300) → Call API → Handle Response → Launch Agent
         ↓ reimagined
Bridge Engine 5-Step:     Get Bridge Engine (bridge-engine) → AUTO-route (1000+) → Call /v1/chat/completions → 3-layer resilience → Launch Agent (any provider)
```

| Step | OpenRouter (300) | **Bridge Engine (1000+)** |
|------|-------------------|----------------------|
| 1 | Get API key | **Get Bridge Engine** — `bridge-engine serve` → `` |
| 2 | Pick 1 of 300 | **AUTO** — router picks from 1000+ via 16-factor |
| 3 | Call `/chat/completions` | Same API, **19 combo strategies** |
| 4 | Handle response | **3-layer resilience** (retry → backend → mock) |
| 5 | Launch agent | **Launch anywhere** — any provider, any model |

---

## Fabric Details

- **Universal AI Network**, **1000+ chat models** (via `/v1/models`), **1.62B free tokens/month**
- **19 combo routing strategies** (auto, auto/coding, auto/fast, auto/cheap, auto/long-context, fusion, …)
- **16-factor Auto-Combo scorer**: quality, coding Elo, latency, cost, context window, throughput, reliability, freshness, tool-use, vision, privacy, rate-limit, region, free-tier, fallback depth, jitter
- **3-layer resilience**: direct Bridge Engine → backend proxy → deterministic mock (never breaks UI)
- **RTK + Caveman compression**: phrase shortening + extractive summarization + budget-aware head/tail

---

## Architecture (poster)

```
[ChatGPT] [Gemini] [Claude] [Perplexity]
        \      |       |      /
         Universal Extractor (adaptive selectors + generic fallback + lazy-load)
                        ↓
              Smart Memory Engine (clean → RTK/Caveman → summarize)
                        ↓
              Smart AI Router (analyze → 16-factor → ranked models)
                        ↓
              Bridge Engine  /v1/chat/completions  ←→  Backend :8787 /api/transfer (proxy + circuit breaker)
                        ↓
              Result (extension popup + dashboard + history)
```

See `AI_BRIDGE_AGENT_BRIDGE_V2.html` for the premium visual poster (dark neon, gradients, glassmorphism).

---

## Quickstart

```bash
npm install
npm --workspace backend install
npm --workspace backend run dev   # http://localhost:8787
bridge-engine serve                   # /api
# chrome://extensions → Load unpacked → extension/
```

## Links

- Dashboard: http://localhost:8787
- Health: http://localhost:8787/api/health
- Models: http://localhost:8787/api/models
- Bridge Engine: /api/models
