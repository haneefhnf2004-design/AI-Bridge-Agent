/**
 * chatgpt.js — ChatGPT / chat.openai.com + chatgpt.com
 * Robust selectors with fallbacks
 */
(function () {
  function textOf(el) {
    const md = el.querySelector('.markdown, [data-message-author-role] .whitespace-pre-wrap, .prose');
    return (md ? md.innerText : el.innerText)?.trim() ?? '';
  }
  function extractChatGPT() {
    const nodes = document.querySelectorAll('[data-message-author-role]');
    if (nodes.length) {
      return [...nodes].map(n => {
        const roleRaw = n.getAttribute('data-message-author-role') || 'user';
        const role = roleRaw === 'assistant' ? 'assistant' : roleRaw === 'system' ? 'system' : 'user';
        let content = textOf(n);
        // fallback: inner
        if (!content) content = (n.innerText || '').trim();
        // strip "Copy code" etc
        content = content.replace(/\nCopy code\s*/g, '\n').trim();
        return content ? { role, content } : null;
      }).filter(Boolean);
    }
    // fallback: article[data-testid]
    const arts = document.querySelectorAll('article[data-testid*="conversation-turn"]');
    if (arts.length) {
      return [...arts].map((a, i) => {
        const r = a.getAttribute('data-testid') || '';
        const role = /assistant/i.test(r) ? 'assistant' : 'user';
        const c = textOf(a) || a.innerText.trim();
        return c ? { role, content: c } : null;
      }).filter(Boolean);
    }
    return window.__OmniGeneric ? window.__OmniGeneric.extractGeneric() : [];
  }
  window.__OmniChatGPT = { extractChatGPT };
})();
