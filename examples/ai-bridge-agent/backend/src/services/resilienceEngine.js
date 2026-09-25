/**
 * resilienceEngine.js — Bridge Engine 3-Layer Resilience Simulation
 * Layers: Provider Circuit Breaker (CLOSED/DEGRADED/OPEN/HALF_OPEN), Connection Cooldown, Model Lockout
 * Mirrors OmniRoute docs/architecture/RESILIENCE_GUIDE.md behavior without DB persistence (in-memory)
 */

const PROVIDER_PROFILES = {
  oauth: { degradeAt:5, openAt:8, resetMs: 60_000 },
  apikey: { degradeAt:7, openAt:12, resetMs: 30_000 },
  local: { degradeAt:1, openAt:2, resetMs: 15_000 },
};

function profileFor(provider){
  if(!provider) return PROVIDER_PROFILES.apikey;
  const p=String(provider).toLowerCase();
  if(['codex','claude','claude-cli','gemini-cli','antigravity'].includes(p)) return PROVIDER_PROFILES.oauth;
  if(['ollama','lmstudio','local','mlx'].some(x=> p.includes(x))) return PROVIDER_PROFILES.local;
  return PROVIDER_PROFILES.apikey;
}

// In-memory stores
const breakers = new Map(); // provider -> { state, failures, success, lastFailureAt, openUntil, halfOpenAt }
const cooldowns = new Map(); // connectionId -> { rateLimitedUntil, testStatus, lastError, errorCode, backoffLevel, provider }
const lockouts = new Map(); // `${provider}::${connectionId}::${model}` -> { until, reason, at }

function now(){ return Date.now(); }

export function getBreaker(provider){
  const id=String(provider||'unknown');
  if(!breakers.has(id)){
    breakers.set(id, { provider:id, state:'CLOSED', failures:0, success:0, lastFailureAt:0, openUntil:0, nextProbeAt:0, profile: profileFor(id) });
  }
  return breakers.get(id);
}

export function getBreakerStatus(provider){
  const b=getBreaker(provider);
  // lazy recovery
  if(b.state==='OPEN' && b.openUntil && now() >= b.openUntil){
    b.state='HALF_OPEN';
    b.nextProbeAt= now() + 5000;
  }
  // degraded window expiry check
  return {
    provider: b.provider,
    state: b.state,
    failures: b.failures,
    openUntil: b.openUntil || null,
    nextProbeAt: b.nextProbeAt || null,
    profile: b.profile,
    canExecute: b.state!=='OPEN',
    retryAfterMs: b.state==='OPEN' && b.openUntil ? Math.max(0, b.openUntil - now()) : 0,
  };
}

export function canExecute(provider){
  return getBreakerStatus(provider).canExecute;
}

export function recordProviderSuccess(provider){
  const b=getBreaker(provider);
  if(b.state==='HALF_OPEN'){ b.state='CLOSED'; b.failures=0; b.openUntil=0; b.nextProbeAt=0; }
  else if(b.state==='DEGRADED'){ b.failures=Math.max(0, b.failures-1); if(b.failures < b.profile.degradeAt) b.state='CLOSED'; }
  else { b.failures=0; }
  b.success=(b.success||0)+1;
}

const BREAKER_FAILURE_CODES = new Set([408,500,502,503,504]);
export function recordProviderFailure(provider, statusCode=503, opts={}){
  const b=getBreaker(provider);
  // only 408/5xx should trip whole provider breaker; 401/403/429 belong to cooldown/lockout
  if(!BREAKER_FAILURE_CODES.has(Number(statusCode))){ return getBreakerStatus(provider); }
  b.failures+=1;
  b.lastFailureAt=now();
  if(b.failures >= b.profile.openAt){
    b.state='OPEN';
    b.openUntil= now() + b.profile.resetMs;
    b.nextProbeAt= b.openUntil;
  } else if(b.failures >= b.profile.degradeAt){
    b.state='DEGRADED';
  }
  return getBreakerStatus(provider);
}

export function recordHalfOpenResult(provider, success){
  const b=getBreaker(provider);
  if(b.state!=='HALF_OPEN') return getBreakerStatus(provider);
  if(success){ b.state='CLOSED'; b.failures=0; b.openUntil=0; }
  else { b.state='OPEN'; b.openUntil= now() + b.profile.resetMs; }
  return getBreakerStatus(provider);
}

// Connection cooldown: per connection/account/key, exponential backoff
export function markAccountUnavailable(connectionId, provider, opts={}){
  const id=String(connectionId||'conn-'+provider);
  const cur=cooldowns.get(id) || { connectionId:id, provider, rateLimitedUntil:0, testStatus:'available', backoffLevel:0, lastError:null, errorCode:null };
  // terminal states never overwritten by transient cooldown
  if(['banned','expired','credits_exhausted'].includes(cur.testStatus) && !opts.force) return cur;
  const baseMs = profileFor(provider)===PROVIDER_PROFILES.oauth ? 5000 : 3000;
  // prefer upstream Retry-After
  let cooldownMs = baseMs * Math.pow(2, cur.backoffLevel||0);
  if(opts.retryAfterMs && Number.isFinite(opts.retryAfterMs)) cooldownMs = Math.max(cooldownMs, opts.retryAfterMs);
  if(opts.resetMs) cooldownMs= opts.resetMs;
  // anti-thundering guard: don't double-extend if already cooling and very recent
  const remaining = (cur.rateLimitedUntil||0) - now();
  if(remaining > cooldownMs*0.8 && !opts.force){
    return cur;
  }
  cur.rateLimitedUntil = now() + cooldownMs;
  cur.testStatus='unavailable';
  cur.lastError= opts.error || opts.lastError || `cooldown ${cooldownMs}ms`;
  cur.errorCode= opts.errorCode || null;
  cur.backoffLevel= Math.min(6, (cur.backoffLevel||0)+1);
  cur.provider=provider;
  cur.cooldownMs=cooldownMs;
  cooldowns.set(id, cur);
  return cur;
}

export function clearAccountError(connectionId){
  const id=String(connectionId);
  const cur=cooldowns.get(id);
  if(!cur) return null;
  cur.rateLimitedUntil=0;
  cur.testStatus='available';
  cur.lastError=null;
  cur.errorCode=null;
  cur.backoffLevel=0;
  return cur;
}

export function isConnectionCooling(connectionId){
  const c=cooldowns.get(String(connectionId));
  if(!c) return false;
  if(!c.rateLimitedUntil) return false;
  if(c.rateLimitedUntil <= now()){
    // lazy expiry: becomes eligible again
    return false;
  }
  return true;
}

export function getCooldownStatus(connectionId){
  const c=cooldowns.get(String(connectionId));
  if(!c) return { connectionId, cooling:false, rateLimitedUntil:null, testStatus:'available', backoffLevel:0 };
  const cooling = (c.rateLimitedUntil||0) > now();
  return {
    connectionId: c.connectionId,
    provider: c.provider,
    cooling,
    rateLimitedUntil: c.rateLimitedUntil || null,
    retryAfterMs: cooling ? Math.max(0, c.rateLimitedUntil - now()) : 0,
    testStatus: cooling ? c.testStatus : 'available',
    backoffLevel: c.backoffLevel||0,
    lastError: c.lastError,
    errorCode: c.errorCode,
  };
}

// Seed some demo cooldowns so UI has data
(() => {
  const demoProviders=['openai','anthropic','google','deepseek'];
  for(let i=0;i<2;i++){
    const p=demoProviders[i];
    const cid=`demo-conn-${p}-${i+1}`;
    // leave one cooling for visual demo
    if(i===0){
      markAccountUnavailable(cid, p, { error:'429 rate_limited (demo)', errorCode:'rate_limited', retryAfterMs: 8000 });
    }
  }
})();

// Model lockout: per provider+connection+model (e.g. 429 per-model quota or 404 missing model)
export function lockModel(provider, connectionId, model, opts={}){
  const key=`${provider}::${connectionId}::${model}`;
  const until = now() + (opts.ttlMs || (String(provider).includes('local')? 15000 : 30000));
  lockouts.set(key, { provider, connectionId, model, until, reason: opts.reason||'429/404 model lockout', at: now() });
  return lockouts.get(key);
}
export function unlockModel(provider, connectionId, model){
  const key=`${provider}::${connectionId}::${model}`;
  lockouts.delete(key);
}
export function isModelLocked(provider, connectionId, model){
  const key=`${provider}::${connectionId}::${model}`;
  const e=lockouts.get(key);
  if(!e) return false;
  if(e.until <= now()){ lockouts.delete(key); return false; }
  return true;
}
export function getModelLockouts(){
  const out=[];
  for(const [key, v] of lockouts.entries()){
    if(v.until <= now()){ lockouts.delete(key); continue; }
    out.push({ key, ...v, remainingMs: Math.max(0, v.until - now()) });
  }
  return out;
}

// Seed a demo lockout (90s so UI shows live)
lockModel('openai','demo-conn-openai-1','openai/gpt-4o-mini', { reason:'per-model 429 quota (demo)', ttlMs: 90000 });
lockModel('google','demo-conn-google-1','google/gemini-2.0-flash', { reason:'per-model 404 not found (demo)', ttlMs: 90000 });

export function getAllBreakers(){
  const out=[];
  for(const id of breakers.keys()) out.push(getBreakerStatus(id));
  // ensure at least a few providers are represented even if untouched
  const guarantee=['openai','anthropic','google','deepseek','meta-llama','mistralai','qwen'];
  for(const g of guarantee){ if(!out.find(x=> x.provider===g)) out.push(getBreakerStatus(g)); }
  return out;
}

export function getStatus(){
  // Ensure demo data visible even after TTL expiry (regenerate if needed)
  if([...cooldowns.values()].filter(c=> (c.rateLimitedUntil||0) > now()).length===0){
    markAccountUnavailable('demo-conn-openai-1','openai',{ error:'429 rate_limited (demo)', errorCode:'rate_limited', retryAfterMs: 45000 });
  }
  if(getModelLockouts().length===0){
    lockModel('openai','demo-conn-openai-1','openai/gpt-4o-mini', { reason:'per-model 429 quota (demo)', ttlMs: 90000 });
  }
  return {
    at: new Date().toISOString(),
    layers: {
      circuitBreaker: {
        note: 'Per-provider breaker: CLOSED/DEGRADED/OPEN/HALF_OPEN. Only 408/5xx trips provider breaker; 401/403/429 go to cooldown/lockout.',
        states: ['CLOSED','DEGRADED','OPEN','HALF_OPEN'],
        thresholds: { oauth:'5→8 /60s', apikey:'7→12 /30s', local:'1→2 /15s' },
        providers: getAllBreakers(),
      },
      connectionCooldown: {
        note: 'Per-connection cooldown: isolates one bad key/account. OAuth 5s, API 3s, exponential x2, honors Retry-After.',
        connections: [...cooldowns.entries()].map(([id, v])=> getCooldownStatus(id)),
      },
      modelLockout: {
        note: 'Per-model lockout: avoids disabling whole connection when only one model is unavailable (429/404 per model).',
        lockouts: getModelLockouts(),
      },
    },
    summary: {
      openBreakers: getAllBreakers().filter(b=> b.state==='OPEN').length,
      coolingConnections: [...cooldowns.values()].filter(c=> (c.rateLimitedUntil||0) > now()).length,
      lockedModels: getModelLockouts().length,
    }
  };
}

export default { getStatus, getBreakerStatus, canExecute, recordProviderSuccess, recordProviderFailure, markAccountUnavailable, clearAccountError, isConnectionCooling, getCooldownStatus, lockModel, unlockModel, isModelLocked, getAllBreakers, getModelLockouts };
