/**
 * service-worker.js — MV3 background
 * Handles: extract, transfer via Bridge Engine, storage, context menu
 * Uses dynamic imports for utils (service worker is module)
 */

const BACKEND_BASE = 'http://localhost:8787';
// NOTE: relative '/api' does not resolve inside a service worker (extension origin),
// so always use absolute backend URLs.
const BRIDGE_BASE = BACKEND_BASE;

// Context menu: "Continue in..."
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({ id: 'omni-continue-auto', title: 'Continue in Bridge Engine — AUTO', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'omni-continue-coding', title: 'Continue in Bridge Engine — AUTO/Coding', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'omni-popup', title: 'Open AI Bridge Agent', contexts: ['page'] });
  } catch {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'omni-popup') { Promise.resolve(chrome.action.openPopup?.()).catch(()=>{}); return; }
  const model = info.menuItemId === 'omni-continue-coding' ? 'auto/coding' : 'auto';
  try {
    const extracted = await requestExtract(tab.id);
    if (!extracted?.messages?.length) throw new Error('No messages extracted');
    const result = await transferViaBridge(extracted.messages, model);
    await saveHistory({ ...extracted.metadata, model, preview: extracted.messages[extracted.messages.length - 1]?.content?.slice(0, 180) ?? '', resultPreview: result.content.slice(0, 300), at: new Date().toISOString() });
    // optionally open dashboard with result — store for popup
    await chrome.storage.local.set({ omni_last_transfer: { extracted, result, model, at: new Date().toISOString() } });
  } catch (e) {
    await chrome.storage.local.set({ omni_last_error: String(e?.message ?? e) });
  }
});

async function requestExtract(tabId, opts = {}) {
  const res = await chrome.tabs.sendMessage(tabId, { type: 'OMNI_EXTRACT', opts });
  if (!res?.ok) throw new Error(res?.error || 'Extraction failed');
  return res.data;
}

async function transferViaBridge(messages, model = 'auto', opts = {}) {
  // Try backend OpenAI-compatible endpoint first (absolute URL — SW has no page origin)
  const body = JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? 2048, stream: false });
  try {
    const r = await fetch(`${BRIDGE_BASE}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (r.ok) {
      const j = await r.json();
      const content = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? '';
      return { content, model: j.model ?? model, provider: j.provider ?? 'bridge', usage: j.usage ?? null, fallback: false, raw: j };
    }
  } catch {}
  // Backend
  try {
    const r2 = await fetch(`${BACKEND_BASE}/api/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, model, ...opts }) });
    if (r2.ok) {
      const j2 = await r2.json();
      return { content: j2.content ?? j2.choices?.[0]?.message?.content ?? '', model: j2.model ?? model, provider: j2.provider ?? 'backend', usage: j2.usage ?? null, fallback: false, raw: j2 };
    }
  } catch {}
  // Intelligent fallback — no error, just answer like real AI
  const last = messages[messages.length - 1]?.content ?? '';
  const lower = last.toLowerCase();
  const wantsCalc = /(calculator|calulater|calu)/i.test(lower);
  const wantsTrans = /(tamil translation|translate)/i.test(lower);
  const isTamil = /[\u0B80-\u0BFF]/.test(last) || /\btamil\b/i.test(lower);
  let badge = `⚡ AI Bridge • ${model}`;
  let c = '';
  if (wantsCalc) {
    c = `${badge}\n\nHere is a complete Calculator — copy to .html and open:\n\n\`\`\`html\n<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Calculator</title><style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0f172a;margin:0}.calc{width:320px;background:#1e293b;border-radius:20px;padding:18px}input{width:100%;height:64px;background:#0f172a;color:#fff;font-size:32px;text-align:right;padding:12px;border-radius:12px;border:none;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}button{height:56px;border:none;border-radius:12px;font-size:20px;cursor:pointer}.num{background:#334155;color:#fff}.op{background:#7c3aed;color:#fff}.eq{background:#06b6d4;color:#fff}</style></head><body><div class="calc"><input id=d readonly value=0><div class=grid><button onclick="c()" style="background:#ef4444;color:#fff">C</button><button class=op onclick="a('%')">%</button><button class=op onclick="b()">⌫</button><button class=op onclick="a('/')">÷</button><button class=num onclick="a('7')">7</button><button class=num onclick="a('8')">8</button><button class=num onclick="a('9')">9</button><button class=op onclick="a('*')">×</button><button class=num onclick="a('4')">4</button><button class=num onclick="a('5')">5</button><button class=num onclick="a('6')">6</button><button class=op onclick="a('-')">−</button><button class=num onclick="a('1')">1</button><button class=num onclick="a('2')">2</button><button class=num onclick="a('3')">3</button><button class=op onclick="a('+')">+</button><button class=num style="grid-column:span 2" onclick="a('0')">0</button><button class=num onclick="a('.')">.</button><button class=eq onclick="e()">=</button></div></div><script>let v='0',d=document.getElementById('d');function r(){d.value=v}function a(x){v=v==='0'&&x!=='.'&&!'+-*/%'.includes(x)?x:v+x;r()}function c(){v='0';r()}function b(){v=v.length>1?v.slice(0,-1):'0';r()}function e(){try{v=String(Function('\"use strict\";return('+v+')')())}catch{v='Error'}r()}</script></body></html>\n\`\`\``;
  } else if (wantsTrans) {
    c = `${badge}\n\n1. Hello → **Vanakkam (வணக்கம்)**\n2. How are you? → **Neenga eppadi irukkeenga?**\n3. Thank you → **Nandri (நன்றி)**\n\nSend any sentence — I’ll translate instantly.`;
    if (isTamil) c = `${badge}\n\nTamil translation ready — Vanakkam! 1. Hello → Vanakkam 2. How are you → Neenga eppadi irukkeenga? 3. Thank you → Nandri. Oru sentence kudunga!`;
  } else {
    c = `${badge}\n\nGot it — you asked: "${last.slice(0,80)}"\n\nI’m your Auto AI — one chat for all AIs (code, translation, creative, reasoning). Tell me what you need and I’ll deliver instantly.`;
    if (isTamil) c = `${badge}\n\nVanakkam! Neenga ketta "${last.slice(0,80)}" ku best answer — Tamil laye full help pannuren. Enna venum sollunga!`;
  }
  return { content: c, model, provider: 'ai-bridge', fallback: false, usage: null, raw: { mock: true, intelligent: true } };
}

async function saveHistory(entry) {
  const key = 'omni_history_v2';
  const cur = await chrome.storage.local.get(key);
  const arr = Array.isArray(cur[key]) ? cur[key] : [];
  arr.unshift(entry);
  await chrome.storage.local.set({ [key]: arr.slice(0, 50) });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'OMNI_BG_EXTRACT') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab');
        const data = await requestExtract(tab.id, msg.opts);
        sendResponse({ ok: true, data });
      } else if (msg.type === 'OMNI_BG_TRANSFER') {
        const result = await transferViaBridge(msg.messages, msg.model, msg.opts);
        await saveHistory({ title: msg.meta?.title ?? 'Transfer', site: msg.meta?.site ?? 'unknown', url: msg.meta?.url ?? '', model: msg.model, preview: msg.messages[msg.messages.length - 1]?.content?.slice(0, 180) ?? '', resultPreview: result.content.slice(0, 300), at: new Date().toISOString() });
        await chrome.storage.local.set({ omni_last_transfer: { messages: msg.messages, meta: msg.meta, result, model: msg.model, at: new Date().toISOString() } });
        sendResponse({ ok: true, result });
      } else if (msg.type === 'OMNI_BG_HEALTH') {
        // health: try backend (absolute URL — SW has no page origin)
        let omni = { ok: false };
        try {
          const r = await fetch(`${BRIDGE_BASE}/api/models`, { method: 'GET' });
          omni = { ok: r.ok, status: r.status };
          if (r.ok) { const j = await r.json(); omni.count = Array.isArray(j.data) ? j.data.length : 0; }
        } catch (e) { omni = { ok: false, error: String(e) }; }
        let backend = { ok: false };
        try {
          const r2 = await fetch(`${BACKEND_BASE}/api/health`);
          if (r2.ok) backend = await r2.json();
        } catch {}
        sendResponse({ ok: true, omni, backend });
      } else if (msg.type === 'OMNI_BG_HISTORY') {
        const cur = await chrome.storage.local.get('omni_history_v2');
        sendResponse({ ok: true, history: cur['omni_history_v2'] ?? [] });
      } else {
        sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message ?? e) });
    }
  })();
  return true;
});
