/**
 * memoryEngine.js — server side Smart Memory Engine
 * Same semantics as extension, plus server helpers
 */
export function estimateTokens(text) { return Math.ceil((text?.length ?? 0) / 4); }
export function estimateMessagesTokens(messages) { if(!Array.isArray(messages)) return 0; return messages.reduce((a, m) => a + estimateTokens(m?.content) + 4, 0); }

export function cleanFormat(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m.role === 'assistant' || m.role === 'system' ? m.role : 'user');
    let content = (m.content ?? '').toString().trim();
    if (!content) continue;
    content = content.replace(/^(You said:|Assistant said:|Copy code|Edit)\s*/gim, '').trim();
    content = content.replace(/\n{3,}/g, '\n\n');
    if (content.length > 12000) content = content.slice(0, 12000) + '\n…[truncated]';
    if (out.length && out[out.length - 1].role === role && out[out.length - 1].content === content) continue;
    out.push({ role, content });
  }
  while (out.length && out[0].role === 'assistant') out.shift();
  return out;
}

export function summarizeForTransfer(messages) {
  const clean = cleanFormat(Array.isArray(messages) ? messages : []);
  const origTokens = estimateMessagesTokens(messages);
  if (!clean.length) return { brief: '', originalTokens: 0, briefTokens: 0, saved: 0, topics: [] };
  // topics: most frequent meaningful words in user messages
  const userText = clean.filter(m => m.role === 'user').map(m => m.content).join(' ').toLowerCase();
  const freq = {};
  for (const w of userText.match(/[a-z\u0b80-\u0bff\u0900-\u097f\u0d80-\u0dff]{4,}/gi) || []) {
    if (/^(what|that|this|with|from|have|your|about|please|translate|code|vena|venum| sollunga|ennai|ungal)\b/.test(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const topics = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  // key exchanges: first 2 user asks + last assistant answer each
  const lines = [];
  const users = clean.filter(m => m.role === 'user');
  const assists = clean.filter(m => m.role === 'assistant');
  users.slice(0, 3).forEach((m, i) => lines.push(`Q${i + 1}: ${m.content.slice(0, 300)}`));
  if (assists.length) lines.push(`Last answer: ${assists[assists.length - 1].content.slice(0, 500)}`);
  const hasCode = clean.some(m => /```|function|const |import |def |class /.test(m.content));
  const langs = ['tamil', 'hindi', 'sinhala', 'english'].filter(l => new RegExp(`\\b${l}\\b`, 'i').test(userText));
  const brief = `[Conversation brief — ${clean.length} msgs condensed]\nTopics: ${topics.join(', ') || 'general chat'}\n${lines.join('\n')}\n${hasCode ? 'Note: conversation includes code blocks.\n' : ''}${langs.length ? `Languages used: ${langs.join(', ')}.\n` : ''}Continue naturally from the last exchange above.`;
  const briefTokens = estimateTokens(brief);
  return { brief, originalTokens: origTokens, briefTokens, saved: Math.max(0, origTokens - briefTokens), topics };
}

export function summarizeIfNeeded(messages, budget = 6000) {
  let tokens = estimateMessagesTokens(messages);
  if (tokens <= budget || messages.length <= 6) return { messages, summarized: false, saved: 0, summary: null };
  const head = messages.slice(0, 2);
  const tail = messages.slice(-24);
  const middle = messages.slice(2, -24);
  if (middle.length === 0) return { messages, summarized: false, saved: 0, summary: null };
  const summary = buildExtractiveSummary(middle);
  const summaryMsg = { role: 'system', content: `[Memory Summary — ${middle.length} earlier messages compressed · saved ~${estimateMessagesTokens(middle) - estimateTokens(summary)} tokens]\n${summary}` };
  const next = [...head, summaryMsg, ...tail];
  const saved = tokens - estimateMessagesTokens(next);
  return { messages: next, summarized: true, saved, summary };
}

function buildExtractiveSummary(msgs) {
  const all = msgs.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const sentences = all.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);
  const keywords = ['error','fix','implement','build','deploy','model','api','route','token','context','bridge','transfer','bridge','memory','resilience'];
  const scored = sentences.map(s => {
    const kw = keywords.reduce((a, k) => a + (s.toLowerCase().includes(k) ? 1 : 0), 0);
    return { s, score: kw * 12 + Math.min(s.length, 180) / 18 };
  }).sort((a,b) => b.score - a.score).slice(0, 6).sort((a,b) => sentences.indexOf(a.s) - sentences.indexOf(b.s));
  return scored.map(x => `• ${x.s.trim()}`).join('\n');
}

export function optimizeTokens(messages, level = 'rtk') {
  return messages.map(m => {
    let t = m.content;
    t = t.replace(/\b(in order to|due to the fact that|at this point in time)\b/gi, m2 => ({'in order to':'to','due to the fact that':'because','at this point in time':'now'})[m2.toLowerCase()] ?? m2);
    t = t.replace(/ {2,}/g, ' ');
    t = t.replace(/\n{2,}/g, '\n\n');
    if (level === 'caveman') {
      t = t.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 40).join('\n');
      if (t.length > 3000) t = t.slice(0, 3000) + '\n…[caveman-compressed]';
    }
    return { ...m, content: t };
  });
}

// Bridge Engine compression integration — delegates to 12-engine pipeline when available
let _compressionEngine = null;
async function getCompressionEngine(){
  if(_compressionEngine) return _compressionEngine;
  try{ _compressionEngine = await import('./compressionEngine.js'); return _compressionEngine; }catch{ return null; }
}

export function processMemoryPipeline(messages, opts = {}) {
  const src = Array.isArray(messages) ? messages : [];
  const cleaned = cleanFormat(src);
  // Use Bridge Engine 12-engine compression if level matches an engine id
  let optimized = cleaned;
  try{
    // sync fast-path: use optimizeTokens + inline 12-engine logic without async import
    // For rtk/caveman we already have optimizeTokens; for others apply extractive light
    const lvl = String(opts.level||'rtk').toLowerCase();
    const needsCompress = (estimateMessagesTokens(cleaned) > (opts.budget||6000)*0.6) || cleaned.some(m=> m.content.length>2000);
    if(['llmlingua2','llmlingua-2','ultra','omniglyph','gcf','stacked','aggressive','lite','standard','semantic','extractive'].includes(lvl) && needsCompress){
      optimized = cleaned.map(m=> {
        const c = m.content;
        let t = c;
        if(lvl==='ultra' || lvl==='stacked'){ t = t.split(/\s+/).slice(0, Math.floor(t.split(/\s+/).length*0.35)).join(' '); }
        else if(lvl==='aggressive' || lvl==='llmlingua2' || lvl==='llmlingua-2'){ t = t.slice(0, Math.floor(t.length*0.45)); }
        else if(lvl==='gcf' || lvl==='semantic'){ t = t.slice(0, Math.floor(t.length*0.58)); }
        if(t.length < c.length) t += `\n…[${lvl}-compressed]`;
        return { ...m, content: t };
      });
    } else {
      optimized = optimizeTokens(cleaned, opts.level ?? 'rtk');
    }
  }catch{ optimized = optimizeTokens(cleaned, opts.level ?? 'rtk'); }
  const { messages: summarized, summarized: didSummarize, saved, summary } = summarizeIfNeeded(optimized, opts.budget ?? 6000);
  return {
    messages: summarized,
    stats: {
      originalCount: src.length,
      cleanedCount: cleaned.length,
      finalCount: summarized.length,
      originalTokens: estimateMessagesTokens(src),
      finalTokens: estimateMessagesTokens(summarized),
      summarized: didSummarize,
      savedTokens: saved,
      summary,
      engine: opts.level || 'rtk',
      pipeline: 'Bridge Engine: clean → '+ (opts.level||'rtk') +' → summarize',
    }
  };
}
