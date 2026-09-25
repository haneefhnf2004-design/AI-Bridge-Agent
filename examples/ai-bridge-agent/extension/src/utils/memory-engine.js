/**
 * Smart Memory Engine — extension side
 * - cleanFormat: strip UI chrome, normalize roles
 * - summarizeIfNeeded: compress if > token budget
 * - optimizeTokens: RTK + Caveman simulation (deterministic, no API needed)
 * - maintainContext: local vector-like store via chrome.storage.local
 */
const TOKEN_BUDGET = 6000; // soft budget before summarization
const MAX_KEEP = 24; // max messages to keep tail

export function estimateTokens(text) {
  return Math.ceil((text?.length ?? 0) / 4);
}
export function estimateMessagesTokens(messages) {
  return (messages || []).reduce((a, m) => a + estimateTokens(m?.content) + 4, 0);
}

/** Remove empty, dedupe consecutive same-role, trim, clamp length */
export function cleanFormat(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m.role === 'assistant' || m.role === 'system' ? m.role : 'user');
    let content = (m.content ?? '').toString().trim();
    if (!content) continue;
    // strip common UI artifacts
    content = content.replace(/^(You said:|Assistant said:|Copy code|Edit)\s*/gim, '').trim();
    // collapse 3+ newlines
    content = content.replace(/\n{3,}/g, '\n\n');
    // clamp single message
    if (content.length > 12000) content = content.slice(0, 12000) + '\n…[truncated]';
    if (out.length && out[out.length - 1].role === role && out[out.length - 1].content === content) continue;
    out.push({ role, content });
  }
  // ensure starts with user/system
  while (out.length && out[0].role === 'assistant') out.shift();
  // ensure alternation helper (optional, not strict)
  return out;
}

/** Summarize oldest messages into a system note if over budget */
export function summarizeIfNeeded(messages, budget = TOKEN_BUDGET) {
  let tokens = estimateMessagesTokens(messages);
  if (tokens <= budget || messages.length <= 6) return { messages, summarized: false, saved: 0, summary: null };
  // keep first 1-2 as context anchor + last MAX_KEEP tail
  const head = messages.slice(0, 2);
  const tail = messages.slice(-MAX_KEEP);
  const middle = messages.slice(2, -MAX_KEEP);
  if (middle.length === 0) return { messages, summarized: false, saved: 0, summary: null };
  const summary = buildExtractiveSummary(middle);
  const summaryMsg = { role: 'system', content: `[Memory Summary — ${middle.length} earlier messages compressed · saved ~${estimateMessagesTokens(middle) - estimateTokens(summary)} tokens]\n${summary}` };
  const next = [...head, summaryMsg, ...tail];
  const saved = tokens - estimateMessagesTokens(next);
  return { messages: next, summarized: true, saved, summary };
}

/** Deterministic extractive summary — no API */
function buildExtractiveSummary(msgs) {
  // pick first sentences + keywords
  const all = msgs.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const sentences = all.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);
  // score by length + keyword density
  const keywords = ['error','fix','implement','build','deploy','model','api','route','token','context','bridge','transfer','bridge'];
  const scored = sentences.map(s => {
    const kw = keywords.reduce((a, k) => a + (s.toLowerCase().includes(k) ? 1 : 0), 0);
    return { s, score: kw * 12 + Math.min(s.length, 180) / 18 };
  }).sort((a,b) => b.score - a.score).slice(0, 6).sort((a,b) => sentences.indexOf(a.s) - sentences.indexOf(b.s));
  return scored.map(x => `• ${x.s.trim()}`).join('\n');
}

/**
 * RTK + Caveman compression simulation
 * RTK: remove filler, collapse whitespace, shorten verbose phrases
 * Caveman: aggressive keyword-only for very long prompts (optional)
 */
export function optimizeTokens(messages, level = 'rtk') {
  return messages.map(m => {
    let t = m.content;
    // RTK pass
    t = t.replace(/\b(in order to|due to the fact that|at this point in time)\b/gi, m2 => ({'in order to':'to','due to the fact that':'because','at this point in time':'now'})[m2.toLowerCase()] ?? m2);
    t = t.replace(/ {2,}/g, ' ');
    t = t.replace(/\n{2,}/g, '\n\n');
    if (level === 'caveman') {
      // ultra compress: keep sentences with keywords + truncate fluff
      t = t.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 40).join('\n');
      if (t.length > 3000) t = t.slice(0, 3000) + '\n…[caveman-compressed]';
    }
    return { ...m, content: t };
  });
}

const STORE_KEY = 'bridge_memory_v2';

/** Persist last conversation as vector-like memory (extension storage) */
export async function maintainContext(messages, meta = {}) {
  const entry = {
    id: Date.now().toString(36),
    at: new Date().toISOString(),
    meta,
    messages: messages.slice(-30),
    tokens: estimateMessagesTokens(messages),
    keywords: extractKeywords(messages.map(m=>m.content).join(' ').slice(0, 4000)),
  };
  try {
    const cur = await chrome.storage.local.get(STORE_KEY);
    const arr = Array.isArray(cur[STORE_KEY]) ? cur[STORE_KEY] : [];
    arr.unshift(entry);
    // keep last 20
    const next = arr.slice(0, 20);
    await chrome.storage.local.set({ [STORE_KEY]: next });
  } catch {}
  return entry;
}

export async function getMemoryHistory(limit = 20) {
  try {
    const cur = await chrome.storage.local.get(STORE_KEY);
    const arr = cur[STORE_KEY];
    return Array.isArray(arr) ? arr.slice(0, limit) : [];
  } catch { return []; }
}

export async function clearMemory() {
  try { await chrome.storage.local.remove(STORE_KEY); } catch {}
}

function extractKeywords(text) {
  const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were','be','been','this','that','it','as','by','from','you','your','we','our','i','my','me']);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length >= 4 && !stop.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w]||0)+1;
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0, 12).map(([w])=>w);
}
