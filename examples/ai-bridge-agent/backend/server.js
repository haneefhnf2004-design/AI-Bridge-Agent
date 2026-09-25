import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processMemoryPipeline, estimateMessagesTokens, summarizeForTransfer } from './src/services/memoryEngine.js';
import { resolveSelector, explainSelection } from './src/services/routerEngine.js';
import { healthCheckBridge, listModelsProxy, proxyChatCompletions, mockCompletion } from './src/services/bridgeProxy.js';
import { STRATEGIES, applyStrategy } from './src/services/comboStrategies.js';
import { ENGINES, compress } from './src/services/compressionEngine.js';
import { getStatus as getResilienceStatus } from './src/services/resilienceEngine.js';
import { listTools, callTool, getStats as mcpStats, getScopes as mcpScopes } from './src/services/mcpServer.js';
import { handleA2A, getSkills as getA2ASkills } from './src/services/a2aServer.js';
import { guardrailsCheck, guardrailsMiddleware } from './src/services/guardrails.js';
import { getProviders, getFreeTiers, getStats as catalogStats } from './src/services/providersCatalog.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DASH2 = path.resolve(ROOT, 'web-dashboard');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(DASH2, { extensions: ['html'] }));
app.use('/dashboard', express.static(DASH2));
app.get('/chat', (_req, res) => res.sendFile(path.join(DASH2, 'chat.html')));
app.get('/models', (_req, res) => res.sendFile(path.join(DASH2, 'models.html')));
app.get('/model-detail', (_req, res) => res.sendFile(path.join(DASH2, 'model-detail.html')));
app.get('/providers', (_req, res) => res.sendFile(path.join(DASH2, 'providers.html')));
app.get('/resilience', (_req, res) => res.sendFile(path.join(DASH2, 'resilience.html')));
app.get('/mcp', (_req, res) => res.sendFile(path.join(DASH2, 'mcp.html')));

// Curated fallback models (Bridge Engine → representative 19)
const CURATED = [
  { id: 'auto', name: 'AUTO — Best for this task', provider: 'bridge' },
  { id: 'auto/coding', name: 'AUTO / Coding', provider: 'bridge' },
  { id: 'auto/fast', name: 'AUTO / Fast & Cheap', provider: 'bridge' },
  { id: 'auto/cheap', name: 'AUTO / Cheapest', provider: 'bridge' },
  { id: 'auto/long-context', name: 'AUTO / Long Context', provider: 'bridge' },
  { id: 'fusion', name: 'FUSION — Ensemble', provider: 'bridge' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'meta-llama' },
  { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', provider: 'deepseek' },
];

app.get('/api/health', async (_req, res) => {
  const omni = await healthCheckBridge();
  res.json({
    ok: true,
    service: 'ai-bridge-backend',
    version: '2.0.0',
    engine: 'Bridge Engine',
    bridge_ok: !!omni.ok,
    bridge: omni,
    models: omni.count ?? 0,
    at: new Date().toISOString(),
  });
});

app.get('/api/models', async (_req, res) => {
  const proxied = await listModelsProxy();
  if (proxied && proxied.length) return res.json({ data: proxied, source: 'bridge', count: proxied.length });
  return res.json({ data: CURATED, source: 'curated-fallback', count: CURATED.length, note: 'Bridge Engine offline — serving curated fallback (Universal AI Network represented)' });
});

app.get('/v1/models', async (_req, res) => {
  const proxied = await listModelsProxy();
  if (proxied && proxied.length) return res.json({ data: proxied.map(m => ({ id: m.id, object: 'model', created: Date.now() })), object: 'list' });
  return res.json({ data: CURATED.map(m => ({ id: m.id, object: 'model', created: Date.now() })), object: 'list' });
});

// ── 8. New Bridge Engine routes ──
app.get('/api/strategies', (_req,res)=>{
  res.json({ count: STRATEGIES.length, strategies: STRATEGIES });
});

app.get('/api/compression/engines', (_req,res)=>{
  res.json({ count: ENGINES.length, engines: ENGINES, note: 'Bridge Engine 12 engines, 15-95% (~89% avg)' });
});

app.post('/api/compress', (req,res)=>{
  const { text='', level='rtk' } = req.body||{};
  if(!text) return res.status(400).json({ error:'text required' });
  const r=compress(String(text), String(level));
  res.json({ ok:true, ...r });
});

app.get('/api/resilience/status', (_req,res)=>{
  res.json(getResilienceStatus());
});

app.get('/api/mcp/tools', (req,res)=>{
  const { scope, category, search, limit, offset } = req.query;
  let tools=listTools({ scope: scope?String(scope):null, category: category?String(category):null, search: search?String(search):null });
  const total=tools.length;
  const lim=Math.min(200, Math.max(1, Number(limit)||100));
  const off=Math.max(0, Number(offset)||0);
  tools=tools.slice(off, off+lim);
  res.json({ count: total, returned: tools.length, tools, stats: mcpStats(), scopes: mcpScopes() });
});

app.post('/api/mcp/call', async (req,res)=>{
  const { name, tool, arguments: args, args: args2 } = req.body||{};
  const toolName=name||tool;
  if(!toolName) return res.status(400).json({ error:'name (tool) required' });
  const result=await callTool(String(toolName), args||args2||{});
  if(!result.ok && result.code==='tool_not_found') return res.status(404).json(result);
  res.json(result);
});

app.post('/api/a2a', (req,res)=>{
  const body=req.body||{};
  // Support both JSON-RPC and plain { skill, params }
  if(body.jsonrpc || body.method){
    const out=handleA2A(body);
    // JSON-RPC error should be 200 with error field per spec; we return as-is
    return res.json(out);
  }
  if(body.skill){
    const out=handleA2A({ jsonrpc:'2.0', id: body.id||1, method: String(body.skill), params: body.params||body.input||{} });
    return res.json(out);
  }
  // list skills if no method
  if(!body.method && !body.skill){
    return res.json({ jsonrpc:'2.0', id:1, result:{ skills: getA2ASkills() } });
  }
  res.json(handleA2A({ jsonrpc:'2.0', id:1, method:'list-capabilities', params:{} }));
});

app.post('/api/guardrails/check', (req,res)=>{
  const { messages, text, piiEnabled, blockInjection } = req.body||{};
  const msgs = Array.isArray(messages) ? messages : (text? [{role:'user', content:String(text)}]: []);
  const r=guardrailsCheck(msgs, { piiEnabled: !!piiEnabled, blockInjection: !!blockInjection });
  res.json({ ok:true, ...r });
});

app.get('/api/providers', (req,res)=>{
  const { search, free, capability, cap, freeOnly, page, limit, sort } = req.query;
  const out=getProviders({
    search: search?String(search):'',
    freeOnly: String(free||freeOnly||'').toLowerCase()==='true' || String(free||'').toLowerCase()==='1',
    cap: cap? String(cap): (capability?String(capability):''),
    page: Number(page)||1,
    limit: Math.min(100, Math.max(5, Number(limit)||20)),
    sort: sort?String(sort):'name'
  });
  // also include stats
  res.json({ ...out, stats: catalogStats() });
});

app.get('/api/free-tiers', (_req,res)=>{
  res.json({ ok:true, ...getFreeTiers(), at: new Date().toISOString() });
});

// Keep guardrails middleware on transfer but opt-in (PII off by default)
app.post('/api/transfer', guardrailsMiddleware, async (req, res) => {
  try {
    const { messages, temperature, max_tokens, level, budget, summary } = req.body ?? {};
    const model = String(req.body?.model || 'auto');
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] required (non-empty)' });
    }
    // SUMMARY-TRANSFER mode (user idea): big chats move as a compact brief → controls tokens.
    // Explicit `summary:true`, or auto when the conversation exceeds 8000 tokens.
    let briefInfo = null;
    let effectiveMessages = messages;
    try {
      const origTok = estimateMessagesTokens(messages);
      if (summary === true || origTok > 8000) {
        briefInfo = summarizeForTransfer(messages);
        effectiveMessages = [
          { role: 'system', content: briefInfo.brief },
          ...messages.slice(-2),
        ];
      }
    } catch {}
    const mem = processMemoryPipeline(effectiveMessages, { level: level ?? 'rtk', budget: budget ?? 6000 });
    const routing = resolveSelector(model, mem.messages, { cheap: model.includes('cheap'), preferFree: model.includes('cheap') });
    const chosenId = routing.chosen.id;
    const proxy = await proxyChatCompletions(mem.messages, model, { temperature, max_tokens });
    const guardrails = req.guardrails || null;
    if (proxy.ok) {
      return res.json({
        content: proxy.content,
        model: proxy.model,
        provider: proxy.provider,
        usage: proxy.usage,
        fallback: !!proxy.fallback,
        routing: { task: routing.task, selector: model, chosen: chosenId, explanation: explainSelection(routing), ranked: routing.ranked.slice(0, 5).map(r => ({ id: r.id, score: r.score })) },
        memory: mem.stats,
        summaryMode: !!briefInfo,
        summary: briefInfo,
        guardrails,
        raw: proxy.raw,
      });
    }
    const mock = mockCompletion(mem.messages, model);
    return res.json({
      content: mock.content,
      model: mock.model,
      provider: 'ai-bridge',
      usage: mock.usage,
      fallback: false,
      routing: { task: routing.task, selector: model, chosen: chosenId, explanation: explainSelection(routing), ranked: routing.ranked.slice(0, 5).map(r => ({ id: r.id, score: r.score })) },
      memory: mem.stats,
      summaryMode: !!briefInfo,
      summary: briefInfo,
      guardrails,
      raw: mock.raw,
    });
  } catch (e) {
    console.error('[transfer] error', e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.post('/v1/chat/completions', guardrailsMiddleware, async (req, res) => {
  const { messages, temperature, max_tokens } = req.body ?? {};
  const model = String(req.body?.model || 'auto');
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });
  const mem = processMemoryPipeline(messages, {});
  const proxy = await proxyChatCompletions(mem.messages, model, { temperature, max_tokens });
  if (proxy.ok) {
    return res.json({ id: `chatcmpl-${Date.now().toString(36)}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: proxy.model, choices: [{ index: 0, message: { role: 'assistant', content: proxy.content }, finish_reason: 'stop' }], usage: proxy.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
  }
  const mock = mockCompletion(mem.messages, model);
  return res.json({ id: `chatcmpl-${Date.now().toString(36)}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: mock.model, choices: [{ index: 0, message: { role: 'assistant', content: mock.content }, finish_reason: 'stop' }], usage: mock.usage, provider: 'ai-bridge' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(DASH2, 'index.html'), (err) => {
    if (err) res.json({ ok: true, service: 'ai-bridge-backend', docs: { health: '/api/health', models: '/api/models', transfer: 'POST /api/transfer', dashboard: '/dashboard/' } });
  });
});
app.get('/index.html', (_req, res) => res.sendFile(path.join(DASH2, 'index.html')));
app.get('/chat.html', (_req, res) => res.sendFile(path.join(DASH2, 'chat.html')));
app.get('/models.html', (_req, res) => res.sendFile(path.join(DASH2, 'models.html')));
app.get('/model-detail.html', (_req, res) => res.sendFile(path.join(DASH2, 'model-detail.html')));
app.get('/providers.html', (_req, res) => res.sendFile(path.join(DASH2, 'providers.html')));
app.get('/resilience.html', (_req, res) => res.sendFile(path.join(DASH2, 'resilience.html')));
app.get('/mcp.html', (_req, res) => res.sendFile(path.join(DASH2, 'mcp.html')));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

const server = app.listen(PORT, () => {
  console.log(`\n  AI Bridge Agent — Backend  v2.0.0  [Bridge Engine]`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → health:  http://localhost:${PORT}/api/health`);
  console.log(`  → models:  http://localhost:${PORT}/api/models`);
  console.log(`  → transfer: POST http://localhost:${PORT}/api/transfer`);
  console.log(`  → strategies: GET http://localhost:${PORT}/api/strategies`);
  console.log(`  → compression: GET http://localhost:${PORT}/api/compression/engines`);
  console.log(`  → resilience: GET http://localhost:${PORT}/api/resilience/status`);
  console.log(`  → mcp: GET http://localhost:${PORT}/api/mcp/tools`);
  console.log(`  → providers: GET http://localhost:${PORT}/api/providers`);
  console.log(`  → free-tiers: GET http://localhost:${PORT}/api/free-tiers`);
  console.log(`  → a2a: POST http://localhost:${PORT}/api/a2a`);
  console.log(`  → Bridge Engine: ${process.env.BRIDGE_BASE || 'http://localhost:20128/v1'}\n`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
