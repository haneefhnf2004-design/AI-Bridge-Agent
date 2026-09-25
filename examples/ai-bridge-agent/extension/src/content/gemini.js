/**
 * gemini.js — gemini.google.com
 */
(function () {
  function extractGemini() {
    // Gemini DOM: user-query and model-response containers
    const out = [];
    // Try structured selectors
    const userNodes = document.querySelectorAll('user-query, [data-test-id="user-query"], [class*="user-query"]');
    const modelNodes = document.querySelectorAll('model-response, [data-test-id="model-response"], message-content, [class*="model-response"]');
    // Interleave by DOM order
    const all = [...document.querySelectorAll('user-query, model-response, [class*="query-content"], [class*="response-content"], [data-message-author-role]')];
    if (all.length) {
      for (const el of all) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className?.toString() ?? '';
        const role = (tag.includes('model') || /model|response|assistant/i.test(cls) || el.getAttribute('data-message-author-role') === 'assistant') ? 'assistant' : 'user';
        const c = (el.innerText || '').trim();
        if (c && c.length > 2 && c.length < 18000) out.push({ role, content: c });
      }
      if (out.length) return out;
    }
    if (userNodes.length || modelNodes.length) {
      const merged = [];
      const max = Math.max(userNodes.length, modelNodes.length);
      for (let i = 0; i < max; i++) {
        if (userNodes[i]) { const c = (userNodes[i].innerText || '').trim(); if (c) merged.push({ role: 'user', content: c }); }
        if (modelNodes[i]) { const c = (modelNodes[i].innerText || '').trim(); if (c) merged.push({ role: 'assistant', content: c }); }
      }
      if (merged.length) return merged;
    }
    // Fallback: look for turn containers
    const turns = document.querySelectorAll('[class*="conversation-turn"], [class*="chat-history"] > div, main div[class*="ng-"]');
    if (turns.length > 2) {
      const cand = [...turns].map(n => (n.innerText || '').trim()).filter(t => t.length > 20 && t.length < 8000);
      if (cand.length >= 2) return cand.slice(0, 30).map((c, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: c }));
    }
    return window.__OmniGeneric ? window.__OmniGeneric.extractGeneric() : [];
  }
  window.__OmniGemini = { extractGemini };
})();
