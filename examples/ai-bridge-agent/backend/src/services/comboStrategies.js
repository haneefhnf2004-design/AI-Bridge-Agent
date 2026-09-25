/**
 * comboStrategies.js — Bridge Engine 19 Combo Routing Strategies
 * Ported from OmniRoute open-sse/services/combo.ts + AUTO-COMBO.md
 * All strategies are pure functions: (targets, ctx) => ordered Array
 * ctx = { attempts, usage, costs, latencies, headroom, resetWindow, cacheAffinity, taskFit, health, weights }
 */

function hashCode(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); }
function shuffle(arr, seed=Date.now()){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j= hashCode(seed+String(i)) % (i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

// Build synthetic target shape if local test
function normTargets(targets){
  return (targets||[]).map((t,i)=> ({
    id: t.id || t.modelStr || t.model || `target-${i}`,
    model: t.model || t.id || t.modelStr || `target-${i}`,
    provider: t.provider || (t.id||'').split('/')[0] || 'unknown',
    weight: typeof t.weight==='number'? t.weight : 1,
    cost: typeof t.cost==='number'? t.cost : (hashCode(t.id||String(i))%80)/100+0.2,
    latency: typeof t.latency==='number'? t.latency : 300+ (hashCode(t.id||String(i))%1200),
    headroom: typeof t.headroom==='number'? t.headroom : 20+ (hashCode(t.id||String(i))%80),
    resetWindow: typeof t.resetWindow==='number'? t.resetWindow : 3600+ (hashCode(t.id||String(i))%86400),
    contextLen: t.contextLen||t.window||128000,
    cacheAffinity: typeof t.cacheAffinity==='number'? t.cacheAffinity : Math.random(),
    taskFit: typeof t.taskFit==='number'? t.taskFit : 50+ (hashCode(t.id||String(i))%50),
    health: typeof t.health==='number'? t.health : 90,
    usage: typeof t.usage==='number'? t.usage : (hashCode(t.id||String(i))%50),
    providerHealth: t.providerHealth|| 'CLOSED',
    ...t
  }));
}

export const STRATEGIES = [
  { id:'priority', name:'Priority', icon:'sort', desc:'First-target ordered list with explicit priority. Tries targets in the configured order; fallback only on failure.' },
  { id:'weighted', name:'Weighted', icon:'percent', desc:'Weighted random by per-target weight. Draws one target proportional to weight; remaining ordered by weight as fallback chain.' },
  { id:'fill-first', name:'Fill-First', icon:'vertical_align_top', desc:'Fill each target quota before moving to next. Uses quota headroom to exhaust providers sequentially.' },
  { id:'round-robin', name:'Round-Robin', icon:'autorenew', desc:'Cycle through targets in order (batched). stickyRoundRobinLimit controls batch size before rotating.' },
  { id:'p2c', name:'P2C', icon:'balance', desc:'Power-of-Two-Choices: picks 2 random targets, selects the less-loaded one.' },
  { id:'random', name:'Random', icon:'shuffle', desc:'Uniform random selection among healthy targets.' },
  { id:'least-used', name:'Least-Used', icon:'low_priority', desc:'Picks target with lowest current load / usage count.' },
  { id:'cost-optimized', name:'Cost-Optimized', icon:'savings', desc:'Minimize $ per request given catalog pricing. Cheapest healthy target first.' },
  { id:'headroom', name:'Headroom', icon:'battery_charging_full', desc:'Picks target with most remaining quota headroom.' },
  { id:'reset-window', name:'Reset-Window', icon:'schedule', desc:'Prefers targets whose quota window resets soonest (lowest resetWindow secs).' },
  { id:'reset-aware', name:'Reset-Aware', icon:'event_repeat', desc:'Prioritizes by quota reset time — short reset windows ranked higher, with headroom weight.' },
  { id:'context-relay', name:'Context-Relay', icon:'sync_alt', desc:'Hands off context across targets for long conversations; affinity to previous target.' },
  { id:'context-optimized', name:'Context-Optimized', icon:'text_snippet', desc:'Picks target with best fit for current context size vs model window.' },
  { id:'cache-optimized', name:'Cache-Optimized', icon:'cached', desc:'Reorders by prompt-cache affinity — likeliest to hold cached prefix first.' },
  { id:'lkgp', name:'LKGP', icon:'verified', desc:'Last-Known-Good Path: pins to the last successful provider, then falls back to auto scoring.' },
  { id:'auto', name:'Auto (16-factor)', icon:'auto_awesome', desc:'Uses Bridge Engine 16-factor scoring (health, quota, cost, latency, taskFit, quality, sessionAvailability, cacheAffinity, etc). Recommended.' },
  { id:'fusion', name:'Fusion', icon:'hub', desc:'Fans out to panel of models in parallel, then a judge model synthesizes one final answer. Parallel execution.' },
  { id:'pipeline', name:'Pipeline', icon:'linear_scale', desc:'Runs targets sequentially, threading each step output into next step input; only final answer returned.' },
  { id:'strict-random', name:'Strict-Random', icon:'casino', desc:'Random without deduplication of repeats — true uniform each call, may repeat same target.' },
];

export const STRATEGY_IDS = STRATEGIES.map(s=>s.id);

function byId(id){ return STRATEGIES.find(s=>s.id===id); }

// Strategy implementations — each returns ordered array
export function strategyPriority(targets, _ctx={}){
  const t=normTargets(targets);
  return [...t].sort((a,b)=> (a.priority??a._idx??0)-(b.priority??b._idx??0) || a.id.localeCompare(b.id));
}
export function strategyWeighted(targets, ctx={}){
  const t=normTargets(targets);
  const total=t.reduce((s,x)=>s+Math.max(0,x.weight),0);
  if(total<=0) return shuffle(t, ctx.seed ?? 42);
  // weighted draw simulation: sort by weight desc + random jitter proportional to weight
  // For API display we return weight-sorted but first is drawn winner
  const scored=t.map(x=>({ ...x, _w: x.weight + (hashCode(x.id)%5)/10 }));
  scored.sort((a,b)=> b.weight - a.weight || b._w - a._w);
  // probabilistic draw: pick winner
  let r = (hashCode(ctx.seed || String(Date.now())) % 1000)/1000 * total;
  let winner=null;
  for(const c of scored){ r-=c.weight; if(r<=0){ winner=c; break; } }
  if(!winner) winner=scored[0];
  const rest = scored.filter(c=>c.id!==winner.id);
  return [winner, ...rest];
}
export function strategyFillFirst(targets, _ctx){
  const t=normTargets(targets);
  return [...t].sort((a,b)=> b.headroom - a.headroom);
}
export function strategyRoundRobin(targets, ctx={}){
  const t=normTargets(targets);
  const idx = (ctx.rrIndex ?? 0) % Math.max(1,t.length);
  return [...t.slice(idx), ...t.slice(0,idx)];
}
export function strategyP2C(targets, ctx={}){
  const t=normTargets(targets);
  if(t.length<=2) return [...t].sort((a,b)=> a.usage - b.usage);
  const seed=ctx.seed ?? 7;
  const i1= hashCode(seed+'a')%t.length;
  let i2= hashCode(seed+'b')%t.length;
  if(i2===i1) i2=(i2+1)%t.length;
  const a=t[i1], b=t[i2];
  const winner = a.usage <= b.usage ? a : b;
  const loser = winner===a ? b : a;
  const rest = t.filter((_,i)=> i!==i1 && i!==i2).sort((x,y)=> x.usage - y.usage);
  return [winner, loser, ...rest];
}
export function strategyRandom(targets, ctx={}){
  return shuffle(normTargets(targets), ctx.seed ?? Math.random().toString(36));
}
export function strategyLeastUsed(targets, _ctx){
  return [...normTargets(targets)].sort((a,b)=> a.usage - b.usage);
}
export function strategyCostOptimized(targets, _ctx){
  return [...normTargets(targets)].sort((a,b)=> a.cost - b.cost);
}
export function strategyHeadroom(targets, _ctx){
  return [...normTargets(targets)].sort((a,b)=> b.headroom - a.headroom);
}
export function strategyResetWindow(targets, _ctx){
  return [...normTargets(targets)].sort((a,b)=> a.resetWindow - b.resetWindow);
}
export function strategyResetAware(targets, _ctx){
  const t=normTargets(targets);
  return [...t].sort((a,b)=> {
    const sa = (a.headroom/100)*0.6 + (1 - Math.min(1, a.resetWindow/86400))*0.4;
    const sb = (b.headroom/100)*0.6 + (1 - Math.min(1, b.resetWindow/86400))*0.4;
    return sb - sa;
  });
}
export function strategyContextRelay(targets, ctx={}){
  const t=normTargets(targets);
  const last = ctx.lastProvider;
  if(last){
    const pinned=t.find(x=> x.provider===last);
    if(pinned) return [pinned, ...t.filter(x=> x.id!==pinned.id)];
  }
  return [...t];
}
export function strategyContextOptimized(targets, ctx={}){
  const need = ctx.tokensNeeded ?? ctx.contextNeeded ?? 4000;
  const t=normTargets(targets);
  return [...t].sort((a,b)=>{
    const fa = a.contextLen >= need ? (1 - need/a.contextLen) : -1;
    const fb = b.contextLen >= need ? (1 - need/b.contextLen) : -1;
    if(fa!==fb) return fb - fa;
    return b.contextLen - a.contextLen;
  });
}
export function strategyCacheOptimized(targets, _ctx){
  return [...normTargets(targets)].sort((a,b)=> b.cacheAffinity - a.cacheAffinity);
}
export function strategyLKGP(targets, ctx={}){
  const t=normTargets(targets);
  const lkgp = ctx.lkgp || ctx.lastGoodProvider;
  if(lkgp){
    const pinned=t.find(x=> x.provider===lkgp || x.id===lkgp);
    if(pinned && pinned.health>30) return [pinned, ...t.filter(x=> x.id!==pinned.id).sort((a,b)=> b.health - a.health)];
  }
  // fallback to auto scoring
  return strategyAuto(targets, ctx);
}
export function strategyAuto(targets, ctx={}){
  const t=normTargets(targets);
  // 16-factor simplified: health 0.16, quota(headroom) 0.14, costInv 0.14, latencyInv 0.11, taskFit 0.07, stability, tier, etc
  return [...t].map(x=>{
    const quota = x.headroom/100;
    const health = x.health/100;
    const costInv = 1 - Math.min(1, x.cost/5);
    const latencyInv = 1 - Math.min(1, (x.latency-100)/2000);
    const taskFit = x.taskFit/100;
    const sessionAvail = x.sessionAvailability ?? 1;
    const cacheAff = x.cacheAffinity ?? 0.5;
    // weights mimicking DEFAULT_WEIGHTS
    const score = quota*0.1429 + health*0.1605 + costInv*0.1429 + latencyInv*0.1143 + taskFit*0.0762 + cacheAff*0.02 + sessionAvail*0.0476 + 0.04 + (hashCode(x.id)%7-3)/100;
    return { ...x, _score: Math.round(score*1000)/1000 };
  }).sort((a,b)=> b._score - a._score);
}
export function strategyFusion(targets, ctx={}){
  // Fusion fans out — order less relevant, but we order by health then mark as panel
  const t=normTargets(targets);
  const ordered=[...t].sort((a,b)=> b.health - a.health);
  return ordered.map(x=> ({ ...x, _fusion: true, _judge: ctx.judgeModel || ordered[0]?.id }));
}
export function strategyPipeline(targets, _ctx){
  // Pipeline runs sequentially in configured order — preserve input order
  return normTargets(targets).map((x,i)=> ({ ...x, _pipelineStep:i+1 }));
}
export function strategyStrictRandom(targets, ctx={}){
  // No dedup, true random each call even if same — we just shuffle ignoring history
  const t=normTargets(targets);
  const seed = ctx.seed ?? Math.floor(Math.random()*1e9);
  return shuffle(t, seed);
}

export const STRATEGY_FNS = {
  'priority': strategyPriority,
  'weighted': strategyWeighted,
  'fill-first': strategyFillFirst,
  'round-robin': strategyRoundRobin,
  'p2c': strategyP2C,
  'random': strategyRandom,
  'least-used': strategyLeastUsed,
  'cost-optimized': strategyCostOptimized,
  'headroom': strategyHeadroom,
  'reset-window': strategyResetWindow,
  'reset-aware': strategyResetAware,
  'context-relay': strategyContextRelay,
  'context-optimized': strategyContextOptimized,
  'cache-optimized': strategyCacheOptimized,
  'lkgp': strategyLKGP,
  'auto': strategyAuto,
  'fusion': strategyFusion,
  'pipeline': strategyPipeline,
  'strict-random': strategyStrictRandom,
};

export function applyStrategy(strategyId, targets, ctx={}){
  const fn = STRATEGY_FNS[strategyId] || strategyAuto;
  // attach _idx for stable priority
  const withIdx=(targets||[]).map((t,i)=> ({ _idx:i, ...t }));
  return fn(withIdx, ctx);
}

export function describeStrategy(id){
  return byId(id) || { id, name:id, desc:'' };
}

export default { STRATEGIES, STRATEGY_IDS, STRATEGY_FNS, applyStrategy, describeStrategy };
