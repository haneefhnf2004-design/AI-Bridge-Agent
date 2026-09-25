/**
 * compressionEngine.js — Bridge Engine 12-Engine Simulation
 * Engines: RTK, Caveman, LLMLingua-2, Ultra, Omniglyph, GCF v3.2, Lite, Stacked, Aggressive, Standard, Semantic, Extractive
 * 15-95% (~89% avg) compression per OmniRoute docs
 */

export const ENGINES = [
  { id:'rtk', name:'RTK', desc:'Tool-output command detection, JSON filters, dedup, truncation', ratio:0.72, level:'rtk' },
  { id:'caveman', name:'Caveman', desc:'Semantic condensation with rule packs', ratio:0.68, level:'caveman' },
  { id:'llmlingua2', name:'LLMLingua-2', desc:'Token-level perplexity pruning', ratio:0.55, level:'aggressive' },
  { id:'ultra', name:'Ultra', desc:'Maximum compression stacked pipeline', ratio:0.15, level:'ultra' },
  { id:'omniglyph', name:'Omniglyph', desc:'Glyph-based semantic encoding', ratio:0.42, level:'aggressive' },
  { id:'gcf', name:'GCF v3.2', desc:'Grammar-constrained filtering', ratio:0.58, level:'standard' },
  { id:'lite', name:'Lite', desc:'5 lite techniques: whitespace, dedup, tool results, redundant, image URLs', ratio:0.82, level:'lite' },
  { id:'stacked', name:'Stacked', desc:'Multi-engine stacked pipeline (RTK+Caveman+Lite)', ratio:0.35, level:'stacked' },
  { id:'aggressive', name:'Aggressive', desc:'High-ratio extractive + semantic prune', ratio:0.38, level:'aggressive' },
  { id:'standard', name:'Standard', desc:'Balanced summarizing + trimming', ratio:0.62, level:'standard' },
  { id:'semantic', name:'Semantic', desc:'Embeddings-guided sentence keep/drop', ratio:0.52, level:'standard' },
  { id:'extractive', name:'Extractive', desc:'Extractive summary: top-k sentences by keyword score', ratio:0.48, level:'extractive' },
];

function estTokens(s){ return Math.ceil((s?.length||0)/4); }

function applyLite(text){
  let t=text;
  t=t.replace(/[ \t]{2,}/g,' ');
  t=t.replace(/\n{3,}/g,'\n\n');
  // dedup lines
  const lines=t.split('\n');
  const seen=new Set(); const out=[];
  for(const l of lines){ const k=l.trim().toLowerCase(); if(k.length<6 || !seen.has(k)){ out.push(l); if(k.length>=6) seen.add(k); }}
  t=out.join('\n');
  // remove redundant phrases
  t=t.replace(/\b(in order to|due to the fact that|at this point in time|for all intents and purposes)\b/gi, m=>({ 'in order to':'to','due to the fact that':'because','at this point in time':'now','for all intents and purposes':'essentially'})[m.toLowerCase()]||m);
  return t;
}
function applyCaveman(text){
  let t=applyLite(text);
  // rule packs: shorten sentences, remove filler
  t=t.replace(/\b(very|really|quite|rather|actually|basically|essentially|just|simply)\b/gi,'');
  t=t.replace(/\b(is|are|was|were) (going to|able to)\b/gi, 'will');
  // take first 40 non-empty lines, cap 3000
  t=t.split('\n').map(l=>l.trim()).filter(Boolean).slice(0,40).join('\n');
  if(t.length>3000) t=t.slice(0,3000)+'\n…[caveman]';
  return t;
}
function applyRTK(text){
  let t=text;
  // command detection: strip verbose JSON tool outputs
  t=t.replace(/```json[\s\S]*?```/g, m=>{
    if(m.length>800) return '```json\n{"…truncated tool output":true}\n```';
    return m;
  });
  t=t.replace(/\{"[^"]*":\s*(?:"[^"]*"|\d+|true|false|null)(?:,\s*"[^"]*":\s*(?:"[^"]*"|\d+|true|false|null))*\}/g, m=>{
    if(m.length>500) return '{"…":"truncated"}';
    return m;
  });
  t=applyLite(t);
  if(t.length>4000) t=t.slice(0,4000)+'\n…[rtk-truncated]';
  return t;
}
function applyExtractive(text, keep=0.48){
  const sentences=text.split(/(?<=[.!?])\s+/).filter(s=>s.trim().length>20);
  if(sentences.length<=6) return text.slice(0, Math.floor(text.length*keep));
  const keywords=['error','fix','implement','build','deploy','model','api','route','token','bridge','transfer','memory','resilience','code','function','system'];
  const scored=sentences.map(s=>{
    const kw=keywords.reduce((a,k)=>a+(s.toLowerCase().includes(k)?1:0),0);
    return { s, score: kw*12 + Math.min(s.length,180)/18 };
  }).sort((a,b)=> b.score-a.score);
  const n=Math.max(3, Math.ceil(sentences.length*keep));
  const top=new Set(scored.slice(0,n).map(x=>x.s));
  return sentences.filter(s=> top.has(s)).join(' ');
}
function applyLLMLingua(text){
  // simulate perplexity pruning: keep high-signal sentences shorter
  let t=applyExtractive(text, 0.55);
  // further token prune: drop every 6th word if still long (sim mock)
  if(t.length>3500) t=t.split(/\s+/).filter((_,i)=> i%6!==5).join(' ');
  return t;
}
function applyUltra(text){
  let t=applyRTK(applyCaveman(text));
  t=applyExtractive(t, 0.22);
  if(t.length>1800) t=t.slice(0,1800)+'…[ultra]';
  return t;
}
function applyOmniglyph(text){
  let t=applyExtractive(text, 0.42);
  // glyph: compress repeated terms to abbreviations
  const map={ 'function':'fn','implementation':'impl','configuration':'cfg','application':'app','request':'req','response':'res','bridge':'br','engine':'eng' };
  for(const [k,v] of Object.entries(map)) t=t.replace(new RegExp(`\\b${k}\\b`,'gi'), v);
  return t;
}
function applyGCF(text){
  let t=applyLite(text);
  // grammar constrained: keep sentences with verb
  const sens=t.split(/(?<=[.!?])\s+/);
  const kept=sens.filter(s=> /\b(is|are|was|were|has|have|will|can|should|must|does|do|did|be|been)\b/i.test(s) || s.length>60);
  t=(kept.length? kept: sens).join(' ');
  if(t.length>3200) t=t.slice(0,3200)+'…[gcf]';
  return t;
}
function applySemantic(text){
  return applyExtractive(text, 0.52);
}
function applyStandard(text){
  const t=applyLite(text);
  if(t.length>2800) return applyExtractive(t, 0.62);
  return t;
}
function applyAggressive(text){
  let t=applyLite(text);
  t=applyExtractive(t, 0.38);
  if(t.length>2400) t=t.slice(0,2400)+'…[aggressive]';
  return t;
}
function applyStacked(text){
  let t=applyRTK(text);
  t=applyCaveman(t);
  t=applyLite(t);
  t=applyExtractive(t, 0.35);
  if(t.length>2000) t=t.slice(0,2000)+'…[stacked]';
  return t;
}

const ENGINE_FNS={
  rtk: applyRTK,
  caveman: applyCaveman,
  llmlingua2: applyLLMLingua,
  'llmlingua-2': applyLLMLingua,
  ultra: applyUltra,
  omniglyph: applyOmniglyph,
  gcf: applyGCF,
  lite: applyLite,
  stacked: applyStacked,
  aggressive: applyAggressive,
  standard: applyStandard,
  semantic: applySemantic,
  extractive: applyExtractive,
};

export function compress(text, level='rtk'){
  const src = String(text||'');
  if(!src.trim()) return { compressed:'', original:src, ratio:1, saved:0, engine: level, originalTokens:0, compressedTokens:0 };
  const key = String(level||'rtk').toLowerCase();
  const fn = ENGINE_FNS[key] || ENGINE_FNS[key.replace(/[^a-z0-9]/g,'')] || applyRTK;
  let out;
  try{ out=fn(src); } catch{ out=applyLite(src); }
  if(!out || !out.trim()) out=src.slice(0, 900);
  const oT=estTokens(src), cT=estTokens(out);
  const ratio = oT? cT / oT : 1;
  return {
    compressed: out,
    original: src,
    engine: key,
    originalTokens: oT,
    compressedTokens: cT,
    ratio: Math.round(ratio*1000)/1000,
    saved: oT - cT,
    savedPercent: Math.round((1 - ratio)*100),
  };
}

export function compressMessages(messages, level='rtk'){
  const out=messages.map(m=> ({ ...m, content: compress(m.content, level).compressed }));
  const origT=messages.reduce((a,m)=> a+estTokens(m.content),0);
  const compT=out.reduce((a,m)=> a+estTokens(m.content),0);
  return { messages: out, originalTokens: origT, compressedTokens: compT, ratio: origT? Math.round(compT/origT*1000)/1000:1, saved: origT-compT };
}

export function listEngines(){ return ENGINES; }

export default { compress, compressMessages, listEngines, ENGINES };
