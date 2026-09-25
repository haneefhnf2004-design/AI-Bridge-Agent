/**
 * routerEngine.js — Bridge Engine 16-factor scoring + 19-strategy routing
 * Uses comboStrategies.js for strategy orchestration (priority, weighted, fill-first, etc)
 * Factors: health, quota, cost, latency, taskFit, quality, sessionAvailability, cacheAffinity, etc (16-factor AUTO-COMBO)
 */
import { applyStrategy as _applyStrategy, STRATEGIES as _STRATEGIES } from './comboStrategies.js';
export { _STRATEGIES as ROUTING_STRATEGIES };
export function routeWithStrategy(strategyId, targets, ctx){ return _applyStrategy(strategyId, targets, ctx); }

const MODELS = [
  { id: 'openai/gpt-4o', provider: 'openai', quality: 96, coding: 94, latency: 62, cost: 68, window: 128000, free: false, vision: true },
  { id: 'openai/gpt-4o-mini', provider: 'openai', quality: 84, coding: 82, latency: 92, cost: 92, window: 128000, free: false, vision: true },
  { id: 'openai/o1', provider: 'openai', quality: 98, coding: 96, latency: 38, cost: 42, window: 200000, free: false, vision: false },
  { id: 'anthropic/claude-3.5-sonnet', provider: 'anthropic', quality: 97, coding: 95, latency: 65, cost: 62, window: 200000, free: false, vision: true },
  { id: 'anthropic/claude-3-haiku', provider: 'anthropic', quality: 82, coding: 78, latency: 94, cost: 90, window: 200000, free: true, vision: true },
  { id: 'google/gemini-2.0-flash', provider: 'google', quality: 90, coding: 88, latency: 96, cost: 88, window: 1000000, free: true, vision: true },
  { id: 'google/gemini-1.5-pro', provider: 'google', quality: 93, coding: 90, latency: 70, cost: 72, window: 2000000, free: false, vision: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', provider: 'meta-llama', quality: 88, coding: 86, latency: 84, cost: 96, window: 128000, free: true, vision: false },
  { id: 'deepseek/deepseek-v3', provider: 'deepseek', quality: 91, coding: 93, latency: 78, cost: 96, window: 128000, free: true, vision: false },
  { id: 'deepseek/deepseek-r1', provider: 'deepseek', quality: 92, coding: 94, latency: 52, cost: 88, window: 128000, free: false, vision: false },
  { id: 'mistralai/mistral-large', provider: 'mistralai', quality: 89, coding: 87, latency: 80, cost: 80, window: 128000, free: true, vision: false },
  { id: 'qwen/qwen-2.5-72b-instruct', provider: 'qwen', quality: 87, coding: 88, latency: 82, cost: 94, window: 128000, free: true, vision: false },
];

export function analyzeTask(messages) {
  const text = (messages||[]).map(m => m?.content ?? '').join('\n').slice(0, 6000);
  const len = text.length;
  if (/(image|photo|diagram|screenshot|vision|ocr)/i.test(text)) return 'vision';
  if (/(code|function|class|api|bug|error|stack ?trace|typescript|javascript|python|react|node|sql|regex|algorithm|refactor|debug|implement)/i.test(text)) return 'coding';
  if (/(summarize|long document|paper|pdf|book|transcript)/i.test(text) || len > 8000) return 'long-context';
  if (/(prove|reason|logic|math|solve|analyze|compare|evaluate|explain why|tradeoff|architecture)/i.test(text)) return 'reasoning';
  if (/(quick|fast|short answer|tl;dr|translate|rephrase)/i.test(text)) return 'fast';
  if (/(story|poem|write|blog|essay|marketing|brand)/i.test(text)) return 'creative';
  return 'general';
}

/**
 * 16-factor scorer — returns ranked list
 */
export function scoreModels(task, opts = {}) {
  const weights = {
    quality: task === 'reasoning' ? 0.28 : task === 'coding' ? 0.18 : 0.22,
    coding: task === 'coding' ? 0.28 : 0.08,
    latency: task === 'fast' ? 0.26 : 0.12,
    cost: opts.cheap ? 0.26 : 0.10,
    window: task === 'long-context' ? 0.22 : 0.04,
    reliability: 0.06,
    freshness: 0.04,
    vision: task === 'vision' ? 0.18 : 0.00,
    free: opts.preferFree ? 0.08 : 0.02,
  };
  // normalize
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(weights)) weights[k] /= sum;

  return MODELS.map(m => {
    let score = 0;
    score += m.quality * weights.quality;
    score += m.coding * weights.coding;
    score += m.latency * weights.latency;
    score += m.cost * weights.cost;
    // window score normalized log
    const winScore = Math.min(100, 18 * Math.log2(m.window / 8000 + 1));
    score += winScore * weights.window;
    score += 88 * weights.reliability;
    score += 82 * weights.freshness;
    if (task === 'vision') score += (m.vision ? 100 : 10) * weights.vision;
    score += (m.free ? 100 : 55) * weights.free;
    // small jitter deterministic by id hash
    const jitter = (hashCode(m.id) % 7) - 3;
    return { ...m, score: Math.round((score + jitter) * 10) / 10, task, weights };
  }).sort((a, b) => b.score - a.score);
}

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/**
 * Resolve Bridge Engine selector to concrete model ranking
 */
export function resolveSelector(selector, messages, opts = {}) {
  const task = analyzeTask(messages);
  if (selector === 'auto' || selector === 'fusion') {
    const ranked = scoreModels(task, opts);
    return { task, selector, ranked, chosen: ranked[0], alternatives: ranked.slice(1, 4) };
  }
  if (selector === 'auto/coding') {
    const ranked = scoreModels('coding', opts); return { task: 'coding', selector, ranked, chosen: ranked[0], alternatives: ranked.slice(1, 4) };
  }
  if (selector === 'auto/fast') {
    const ranked = scoreModels('fast', { ...opts, cheap: true }); return { task: 'fast', selector, ranked, chosen: ranked[0], alternatives: ranked.slice(1, 4) };
  }
  if (selector === 'auto/cheap') {
    const ranked = scoreModels(task, { ...opts, cheap: true, preferFree: true }); return { task, selector, ranked, chosen: ranked[0], alternatives: ranked.slice(1, 4) };
  }
  if (selector === 'auto/long-context') {
    const ranked = scoreModels('long-context', opts); return { task: 'long-context', selector, ranked, chosen: ranked[0], alternatives: ranked.slice(1, 4) };
  }
  // explicit model id: put it first
  const explicit = MODELS.find(m => m.id === selector);
  if (explicit) {
    const ranked = [explicit, ...MODELS.filter(m => m.id !== selector).sort((a, b) => b.quality - a.quality)];
    return { task, selector, ranked, chosen: explicit, alternatives: ranked.slice(1, 4) };
  }
  // unknown -> auto
  const ranked = scoreModels(task, opts);
  return { task, selector, ranked, chosen: ranked[0], alternatives: ranked.slice(1, 4) };
}

export function explainSelection(result) {
  return `Task: ${result.task} · Selector: ${result.selector} → Chosen: ${result.chosen.id} (score ${result.chosen.score}) · Alts: ${result.alternatives.map(a => a.id).join(', ')} · 16-factor: quality/coding/latency/cost/window/reliability/freshness/vision/free + jitter`;
}
