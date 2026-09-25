/**
 * extractor.js — Universal extractor orchestrator
 * Detects site, delegates to site-specific, falls back to generic
 * Handles lazy-load by scrolling & waiting, returns {messages, metadata}
 */
(function () {
  const SITE = (() => {
    const h = location.hostname;
    if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
    if (h.includes('gemini.google.com')) return 'gemini';
    if (h.includes('claude.ai')) return 'claude';
    if (h.includes('perplexity.ai')) return 'perplexity';
    if (h.includes('deepseek.com')) return 'deepseek';
    if (h.includes('copilot.microsoft.com')) return 'copilot';
    if (h.includes('mistral.ai')) return 'mistral';
    if (h.includes('qwen.ai')) return 'qwen';
    if (h.includes('grok.com')) return 'grok';
    if (h.includes('meta.ai')) return 'metaai';
    return 'unknown';
  })();

  function detectSite() { return SITE; }

  async function ensureLoaded() {
    // scroll to top then bottom to trigger lazy load, then back to top
    const scroller = document.scrollingElement || document.documentElement;
    const prev = scroller.scrollTop;
    try {
      window.scrollTo(0, 0);
      await sleep(250);
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
      window.scrollTo(0, 0);
      await sleep(300);
    } catch {}
    try { window.scrollTo(0, prev); } catch {}
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function extractRaw() {
    try {
      if (SITE === 'chatgpt' && window.__OmniChatGPT) return window.__OmniChatGPT.extractChatGPT();
      if (SITE === 'gemini' && window.__OmniGemini) return window.__OmniGemini.extractGemini();
      if (SITE === 'claude' && window.__OmniClaude) return window.__OmniClaude.extractClaude();
      if (SITE === 'perplexity' && window.__OmniPerplexity) return window.__OmniPerplexity.extractPerplexity();
    } catch (e) { console.warn('[Bridge Engine] site extractor failed', e); }
    try { return window.__OmniGeneric ? window.__OmniGeneric.extractGeneric() : []; } catch { return []; }
  }

  function clean(messages) {
    if (!Array.isArray(messages)) return [];
    const out = [];
    for (const m of messages) {
      let c = (m.content ?? '').toString().trim();
      if (!c) continue;
      // normalize newlines
      c = c.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (c.length < 2) continue;
      const role = m.role === 'assistant' || m.role === 'system' ? m.role : 'user';
      if (out.length && out[out.length - 1].role === role && out[out.length - 1].content === c) continue;
      out.push({ role, content: c });
    }
    // clamp
    return out.slice(0, 80).map(m => ({ role: m.role, content: m.content.length > 14000 ? m.content.slice(0, 14000) + '\n…[truncated]' : m.content }));
  }

  async function extractConversation(opts = {}) {
    if (opts.ensureLoaded !== false) await ensureLoaded();
    let raw = extractRaw();
    // retry once after small delay if empty
    if (!raw.length) { await sleep(500); raw = extractRaw(); }
    const messages = clean(raw);
    const title = (document.title || '').replace(/\s*[|–-]\s*(ChatGPT|Gemini|Claude|Perplexity).*$/i, '').trim().slice(0, 120) || 'Untitled conversation';
    const url = location.href;
    const metadata = {
      site: SITE,
      title,
      url,
      extractedAt: new Date().toISOString(),
      messageCount: messages.length,
      chars: messages.reduce((a, m) => a + m.content.length, 0),
      host: location.hostname,
    };
    return { messages, metadata };
  }

  // Expose for content-script messaging
  window.__OmniExtractor = { extractConversation, detectSite, extractRaw, SITE };

  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'OMNI_EXTRACT') {
      extractConversation(msg.opts || {}).then(data => sendResponse({ ok: true, data })).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true; // async
    }
    if (msg?.type === 'OMNI_DETECT') {
      sendResponse({ ok: true, site: detectSite(), url: location.href, title: document.title });
      return false;
    }
  });

  console.log('[Bridge Engine] extractor ready — site:', SITE);
})();
