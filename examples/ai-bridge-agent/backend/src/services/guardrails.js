/**
 * guardrails.js — Bridge Engine Guardrails (PII redaction opt-in, prompt injection guard, vision check)
 * Middleware for POST /api/transfer
 */

// PII patterns (strictly bounded regex to avoid ReDoS)
const PII_PATTERNS=[
  { name:'email', re:/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, mask:'[EMAIL_REDACTED]' },
  { name:'phone', re:/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g, mask:'[PHONE_REDACTED]' },
  { name:'ssn', re:/\b\d{3}-\d{2}-\d{4}\b/g, mask:'[SSN_REDACTED]' },
  { name:'credit_card', re:/\b(?:\d[ -]*?){13,16}\b/g, mask:'[CARD_REDACTED]' },
  { name:'ipv4', re:/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, mask:'[IP_REDACTED]' },
  { name:'api_key', re:/\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36,}|AKIA[0-9A-Z]{16})\b/g, mask:'[KEY_REDACTED]' },
];

export function redactPII(text, opts={ enabled:false }){
  if(!opts.enabled) return { text, redacted:false, hits:[] };
  let out=String(text||'');
  const hits=[];
  for(const p of PII_PATTERNS){
    const matches = out.match(p.re);
    if(matches){
      hits.push({ type:p.name, count: matches.length });
      out=out.replace(p.re, p.mask);
    }
  }
  return { text: out, redacted: hits.length>0, hits };
}

// Prompt injection guard - detects common injection attempts, non-blocking by default (warn)
const INJECTION_PATTERNS=[
  /ignore (?:all )?previous instructions/i,
  /ignore (?:the )?above/i,
  /system prompt/i,
  /you are now/i,
  /jailbreak/i,
  /DAN mode/i,
  /do anything now/i,
  /reveal (?:your )?prompt/i,
  /exfiltrate|send (?:all )?(?:data|keys|secrets)/i,
  /\[INST\]/i,
  /<\s*system\s*>/i,
];

export function checkInjection(text){
  const s=String(text||'');
  const hits=[];
  for(const re of INJECTION_PATTERNS){
    if(re.test(s)) hits.push(re.source);
  }
  const flagged = hits.length>0;
  return { flagged, hits, risk: flagged? (hits.length>=2? 'high':'medium'):'low', action: flagged? 'warn':'allow' };
}

export function checkVision(messages){
  const issues=[];
  for(const m of (messages||[])){
    if(!m || typeof m !=='object') continue;
    if(m.content && typeof m.content !=='string'){
      // multimodal content array
      const parts = Array.isArray(m.content)? m.content: [m.content];
      for(const p of parts){ if(p.type==='image_url' && !p.image_url?.url) issues.push('image_url missing url'); }
    }
    // vision check: if user asks for vision but model may not support - just advisory
  }
  return { ok: issues.length===0, issues };
}

export function guardrailsCheck(messages, opts={}){
  const text=(messages||[]).map(m=> (!m||typeof m!=='object') ? '' : (typeof m.content==='string'? m.content: JSON.stringify(m.content))).join('\n');
  const pii = redactPII(text, { enabled: !!opts.piiEnabled });
  const inj = checkInjection(text);
  const vision = checkVision(messages);
  // decide: block only if high-risk injection and blockInjection flag
  const shouldBlock = inj.risk==='high' && !!opts.blockInjection;
  return {
    pii: { enabled: !!opts.piiEnabled, ...pii },
    injection: inj,
    vision,
    blocked: shouldBlock,
    action: shouldBlock? 'block':'allow',
  };
}

// Express middleware for /api/transfer
export function guardrailsMiddleware(req, res, next){
  const messages=req.body?.messages;
  if(!Array.isArray(messages)) return next();
  const piiEnabled = String(process.env.PII_REDACTION_ENABLED||'false').toLowerCase()==='true' || !!req.body?.piiEnabled || !!req.headers['x-pii-redact'];
  const blockInjection = String(process.env.BLOCK_INJECTION||'false').toLowerCase()==='true';
  const result = guardrailsCheck(messages, { piiEnabled, blockInjection });
  // attach to req for downstream use
  req.guardrails = result;
  // if PII redaction enabled, mutate messages content
  if(result.pii.redacted && piiEnabled){
    req.body.messages = messages.map(m=> {
      if(!m || typeof m!=='object') return m;
      if(typeof m.content==='string'){
        const r=redactPII(m.content, { enabled:true });
        return { ...m, content: r.text };
      }
      return m;
    });
  }
  if(result.blocked){
    return res.status(400).json({ error:'Guardrail blocked: prompt injection detected', guardrails: result });
  }
  // warn header
  if(result.injection.flagged){
    res.setHeader('X-Bridge-Guardrail', `injection:${result.injection.risk}`);
  }
  next();
}

export default { redactPII, checkInjection, checkVision, guardrailsCheck, guardrailsMiddleware };
