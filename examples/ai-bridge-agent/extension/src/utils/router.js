/**
 * Smart AI Router — maps user intent → best Bridge Engine model selector
 * Heuristics only (no API needed). 16-factor scoring is simulated server-side.
 * Model strings use Bridge Engine selectors: auto, auto/coding, auto/fast, auto/cheap, auto/long-context, fusion
 */

const CODING_RE = /(code|function|class|api|bug|error|stack ?trace|typescript|javascript|python|react|node|sql|regex|algorithm|refactor|debug|implement|build)/i;
const REASONING_RE = /(prove|reason|logic|math|solve|analyze|compare|evaluate|explain why|tradeoff|architecture)/i;
const CREATIVE_RE = /(story|poem|write|blog|essay|marketing|brand|script|lyric|narrative)/i;
const LONG_RE = /(summarize|long document|paper|pdf|book|transcript|meeting notes)/i;
const FAST_RE = /(quick|fast|short answer|tl;dr|one-liner|translate|rephrase)/i;
const VISION_RE = /(image|photo|diagram|screenshot|vision|ocr)/i;

export function analyzeQueryType(messages) {
  const text = (messages || []).map(m => (m && typeof m.content === 'string') ? m.content : '').join('\n').slice(0, 6000);
  const len = text.length;
  if (VISION_RE.test(text)) return 'vision';
  if (CODING_RE.test(text)) return 'coding';
  if (LONG_RE.test(text) || len > 8000) return 'long-context';
  if (REASONING_RE.test(text)) return 'reasoning';
  if (CREATIVE_RE.test(text)) return 'creative';
  if (FAST_RE.test(text)) return 'fast';
  return 'general';
}

/**
 * Select best Bridge Engine model selector for a query type
 * @param {'coding'|'reasoning'|'creative'|'long-context'|'fast'|'vision'|'general'} type
 * @param {object} opts { cheap:boolean, privacy:boolean }
 */
export function selectBestModel(type, opts = {}) {
  if (opts.cheap) return 'auto/cheap';
  switch (type) {
    case 'coding': return 'auto/coding';
    case 'reasoning': return 'auto'; // strongest reasoning
    case 'long-context': return 'auto/long-context';
    case 'fast': return 'auto/fast';
    case 'vision': return 'auto'; // vision-capable pool
    case 'creative': return 'auto';
    default: return 'auto';
  }
}

export function recommendModels(type) {
  const primary = selectBestModel(type);
  const alts = {
    coding: ['auto/coding', 'auto', 'fusion'],
    reasoning: ['auto', 'fusion', 'auto/coding'],
    'long-context': ['auto/long-context', 'auto', 'auto/cheap'],
    fast: ['auto/fast', 'auto/cheap', 'auto'],
    general: ['auto', 'auto/fast', 'fusion'],
    creative: ['auto', 'fusion', 'auto/fast'],
    vision: ['auto', 'auto/fast'],
  };
  return { primary, alternatives: alts[type] ?? alts.general, type };
}

/** Human-readable explanation */
export function explainRouting(type, model) {
  const map = {
    coding: 'Code-heavy → auto/coding (top coding Elo, fast tools)',
    reasoning: 'Reasoning → auto (strongest model pool)',
    'long-context': 'Long context → auto/long-context (200K+ windows)',
    fast: 'Quick answer → auto/fast (low latency, cheap)',
    creative: 'Creative → auto (highest quality pool)',
    vision: 'Vision → auto (vision-capable models)',
    general: 'General → auto (balanced quality/latency/cost)',
  };
  return `${map[type] ?? map.general}  →  ${model}`;
}

/** Curated model groups for popup dropdown */
export function modelGroups() {
  return [
    { label: '★ Bridge Engine Smart', models: [
      { id: 'auto', name: 'AUTO — Best for this task' },
      { id: 'auto/coding', name: 'AUTO / Coding' },
      { id: 'auto/fast', name: 'AUTO / Fast & Cheap' },
      { id: 'auto/cheap', name: 'AUTO / Cheapest' },
      { id: 'auto/long-context', name: 'AUTO / Long Context' },
      { id: 'fusion', name: 'FUSION — Ensemble' },
    ]},
    { label: 'OpenAI', models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'openai/o1', name: 'o1' },
      { id: 'openai/o1-mini', name: 'o1-mini' },
    ]},
    { label: 'Anthropic', models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
    ]},
    { label: 'Google', models: [
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ]},
    { label: 'Open & Others', models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
      { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
      { id: 'mistralai/mistral-large', name: 'Mistral Large' },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' },
    ]},
  ];
}
