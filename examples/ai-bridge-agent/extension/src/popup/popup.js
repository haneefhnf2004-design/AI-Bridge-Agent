/**
 * popup.js — logic for premium popup
 * ES module, uses chrome.* APIs
 */
import { modelGroups, analyzeQueryType, selectBestModel, explainRouting } from '../utils/router.js';

const els = {
  healthDot: document.getElementById('healthDot'),
  siteBadge: document.getElementById('siteBadge'),
  siteTitle: document.getElementById('siteTitle'),
  metaLine: document.getElementById('metaLine'),
  msgCount: document.getElementById('msgCount'),
  preview: document.getElementById('preview'),
  tokenLine: document.getElementById('tokenLine'),
  modelSelect: document.getElementById('modelSelect'),
  routeExplain: document.getElementById('routeExplain'),
  cheapCheck: document.getElementById('cheapCheck'),
  compressCheck: document.getElementById('compressCheck'),
  transferBtn: document.getElementById('transferBtn'),
  progress: document.getElementById('progress'),
  barFill: document.getElementById('barFill'),
  progressText: document.getElementById('progressText'),
  resultPanel: document.getElementById('resultPanel'),
  resultText: document.getElementById('resultText'),
  resultMeta: document.getElementById('resultMeta'),
  copyBtn: document.getElementById('copyBtn'),
  openDashBtn: document.getElementById('openDashBtn'),
  extractBtn: document.getElementById('extractBtn'),
  history: document.getElementById('history'),
  clearHist: document.getElementById('clearHist'),
  healthLink: document.getElementById('healthLink'),
  dashLink: document.getElementById('dashLink'),
};

let current = { messages: [], meta: null, tokens: 0 };

function estTokens(t) { return Math.ceil((t?.length ?? 0) / 4); }
function estMsgsTokens(msgs) { return msgs.reduce((a, m) => a + estTokens(m.content) + 4, 0); }

function populateModels(defaultModel) {
  els.modelSelect.innerHTML = '';
  for (const g of modelGroups()) {
    const og = document.createElement('optgroup');
    og.label = g.label;
    for (const m of g.models) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.name;
      if (m.id === defaultModel) o.selected = true;
      og.appendChild(o);
    }
    els.modelSelect.appendChild(og);
  }
}

function renderPreview(messages) {
  if (!messages.length) {
    els.preview.innerHTML = '<div class="hint">No messages extracted. Navigate to ChatGPT / Gemini / Claude / Perplexity and click Re-extract.</div>';
    els.msgCount.textContent = '0 messages';
    els.tokenLine.innerHTML = '';
    return;
  }
  els.msgCount.textContent = `${messages.length} messages`;
  const toks = estMsgsTokens(messages);
  const chars = messages.reduce((a, m) => a + String(m.content ?? '').length, 0);
  els.tokenLine.innerHTML = `<span><b>${toks.toLocaleString()}</b> tokens est.</span><span><b>${chars.toLocaleString()}</b> chars</span><span>${toks > 6000 ? '⚠️ will summarize head' : '✓ within budget'}</span>`;
  els.preview.innerHTML = '';
  const slice = messages.slice(-8);
  for (const m of slice) {
    const d = document.createElement('div');
    d.className = `msg msg--${m.role}`;
    const text = String(m.content ?? '');
    d.innerHTML = `<div class="msg-role">${m.role.toUpperCase()}</div>${escapeHtml(text.slice(0, 420))}${text.length > 420 ? '…' : ''}`;
    els.preview.appendChild(d);
  }
  if (messages.length > 8) {
    const more = document.createElement('div');
    more.className = 'hint';
    more.textContent = `+ ${messages.length - 8} earlier messages (included in transfer)`;
    els.preview.prepend(more);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setSiteBadge(site, title, meta) {
  const map = {
    chatgpt: ['badge--chatgpt', 'ChatGPT'],
    gemini: ['badge--gemini', 'Gemini'],
    claude: ['badge--claude', 'Claude'],
    perplexity: ['badge--perplexity', 'Perplexity'],

    deepseek: ['badge--deepseek', 'DeepSeek'],

    copilot: ['badge--copilot', 'Microsoft Copilot'],

    mistral: ['badge--mistral', 'Mistral Le Chat'],

    qwen: ['badge--qwen', 'Qwen'],

    grok: ['badge--grok', 'Grok'],

    metaai: ['badge--metaai', 'Meta AI'],
    unknown: ['badge--unknown', 'Unknown / Generic'],
  };
  const [cls, label] = map[site] ?? map.unknown;
  els.siteBadge.className = `badge ${cls}`;
  els.siteBadge.textContent = label;
  els.siteTitle.textContent = title || meta?.title || '—';
  els.metaLine.textContent = meta ? `${meta.messageCount} msgs · ${meta.host} · ${new Date(meta.extractedAt).toLocaleTimeString()}` : '—';
}

async function refreshHealth() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'OMNI_BG_HEALTH' });
    const omniOk = r?.omni?.ok;
    const backendOk = r?.backend?.bridge_ok ?? r?.backend?.ok;
    if (omniOk) { els.healthDot.className = 'dot dot--on'; els.healthDot.title = `Bridge Engine OK · ${r.omni.count ?? '?'} models`; }
    else if (backendOk) { els.healthDot.className = 'dot dot--warn'; els.healthDot.title = 'Backend OK, Bridge Engine offline — will use backend/mock'; }
    else { els.healthDot.className = 'dot dot--off'; els.healthDot.title = 'Offline — transfers will use mock fallback'; }
  } catch { els.healthDot.className = 'dot dot--off'; }
}

async function doExtract() {
  els.preview.innerHTML = '<div class="hint">Extracting… (scrolling to load lazy content)</div>';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'OMNI_BG_EXTRACT', opts: { ensureLoaded: true } });
    if (!res?.ok) throw new Error(res?.error || 'Extract failed');
    current.messages = res.data.messages ?? [];
    current.meta = res.data.metadata ?? null;
    current.tokens = estMsgsTokens(current.messages);
    setSiteBadge(current.meta?.site ?? 'unknown', current.meta?.title, current.meta);
    // auto-select model via router
    const qtype = analyzeQueryType(current.messages);
    const chosen = els.cheapCheck.checked ? 'auto/cheap' : selectBestModel(qtype);
    populateModels(chosen);
    els.routeExplain.textContent = explainRouting(qtype, chosen) + ` · ${current.messages.length} msgs`;
    renderPreview(current.messages);
    els.transferBtn.disabled = current.messages.length === 0;
  } catch (e) {
    els.preview.innerHTML = `<div class="hint">Extract failed: ${escapeHtml(String(e.message ?? e))}<br/>Open a ChatGPT/Gemini/Claude/Perplexity conversation and try again.</div>`;
    setSiteBadge('unknown', '', null);
    populateModels('auto');
    els.routeExplain.textContent = 'No conversation — select a target anyway or re-extract.';
  }
}

function setProgress(pct, text) {
  els.progress.classList.remove('hidden');
  els.barFill.style.width = `${pct}%`;
  els.progressText.textContent = text;
}

async function doTransfer() {
  if (!current.messages.length) { alert('No conversation extracted yet.'); return; }
  let model = els.modelSelect.value || 'auto';
  // cheap override
  if (els.cheapCheck.checked && model === 'auto') model = 'auto/cheap';
  els.transferBtn.disabled = true;
  els.resultPanel.classList.add('hidden');
  setProgress(18, `Routing via 16-factor scorer → ${model} …`);
  // simulate memory steps
  await new Promise(r => setTimeout(r, 280));
  setProgress(42, 'Cleaning + RTK/Caveman compressing context…');
  await new Promise(r => setTimeout(r, 220));
  setProgress(68, `Calling Bridge Engine ${model} …`);
  try {
    // optionally compress client-side
    let msgs = current.messages;
    if (els.compressCheck.checked) {
      // light RTK: trim + collapse
      msgs = msgs.map(m => ({ ...m, content: m.content.replace(/ {2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim() }));
      // caveman-like head summarize if huge
      const toks = estMsgsTokens(msgs);
      if (toks > 7000) {
        const head = msgs.slice(0, 2);
        const tail = msgs.slice(-18);
        const mid = msgs.slice(2, -18);
        const summary = mid.slice(0, 3).map(m => m.content.slice(0, 120)).join(' | ').slice(0, 500);
        msgs = [...head, { role: 'system', content: `[Compressed ${mid.length} msgs: ${summary}…]` }, ...tail];
      }
    }
    const res = await chrome.runtime.sendMessage({ type: 'OMNI_BG_TRANSFER', messages: msgs, model, meta: current.meta, opts: {} });
    if (!res?.ok) throw new Error(res?.error || 'Transfer failed');
    const r = res.result;
    setProgress(100, r.fallback ? 'Done (mock fallback — start Bridge Engine for real)' : `Done via ${r.provider} · ${r.model}`);
    els.resultText.textContent = r.content;
    els.resultMeta.textContent = `${r.model} · ${r.provider}${r.fallback ? ' · mock' : ''}`;
    els.resultPanel.classList.remove('hidden');
    await loadHistory();
    setTimeout(() => { els.progress.classList.add('hidden'); els.barFill.style.width = '0%'; }, 1800);
  } catch (e) {
    setProgress(100, `Error: ${String(e.message ?? e).slice(0, 120)}`);
    els.resultText.textContent = `Transfer failed:\n${String(e.message ?? e)}\n\nTips:\n- Ensure the tab is a ChatGPT/Gemini/Claude/Perplexity conversation\n- Start Bridge Engine at /api or backend at http://localhost:8787\n- Try Re-extract`;
    els.resultMeta.textContent = 'error';
    els.resultPanel.classList.remove('hidden');
  } finally {
    els.transferBtn.disabled = false;
  }
}

async function loadHistory() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'OMNI_BG_HISTORY' });
    const h = r?.history ?? [];
    if (!h.length) { els.history.innerHTML = '<div class="hint">No transfers yet.</div>'; return; }
    els.history.innerHTML = '';
    for (const it of h.slice(0, 10)) {
      const d = document.createElement('div');
      d.className = 'hist-item';
      d.innerHTML = `<div class="hist-top"><span class="hist-model">${escapeHtml(it.model ?? '')}</span><span class="hist-when">${escapeHtml(new Date(it.at).toLocaleString())}</span></div><div class="hist-prev">${escapeHtml((it.preview ?? it.resultPreview ?? '').slice(0, 120))}</div><div class="hist-prev" style="color:#9aa0c7">${escapeHtml(it.title ?? it.site ?? '')}</div>`;
      els.history.appendChild(d);
    }
  } catch {}
}

// events
els.extractBtn.addEventListener('click', doExtract);
els.transferBtn.addEventListener('click', doTransfer);
els.modelSelect.addEventListener('change', () => {
  const t = analyzeQueryType(current.messages);
  els.routeExplain.textContent = explainRouting(t, els.modelSelect.value);
});
els.cheapCheck.addEventListener('change', () => {
  if (els.cheapCheck.checked) { els.modelSelect.value = 'auto/cheap'; }
  els.routeExplain.textContent = explainRouting(analyzeQueryType(current.messages), els.modelSelect.value);
});
els.copyBtn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(els.resultText.textContent); els.copyBtn.textContent = 'Copied!'; setTimeout(()=> els.copyBtn.textContent='Copy', 1200); } catch {}
});
els.openDashBtn.addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:8787/' }));
els.clearHist.addEventListener('click', async () => { await chrome.storage.local.remove('omni_history_v2'); els.history.innerHTML = '<div class="hint">Cleared.</div>'; });
els.healthLink.addEventListener('click', (e) => { e.preventDefault(); refreshHealth(); alert('Health: hover the dot. Green=Bridge Engine, Yellow=Backend, Red=Mock fallback.'); });
els.dashLink.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'http://localhost:8787/' }); });

// init
populateModels('auto');
refreshHealth();
doExtract();
loadHistory();
setInterval(refreshHealth, 8000);
