/**
 * generic.js — ultra-resilient fallback extractor
 * Loaded first so other site files can override. Exposes window.__OmniGeneric
 */
(function () {
  const ROLE_ATTR_CANDIDATES = [
    '[data-message-author-role]',
    '[data-role]',
    '[data-testid*="conversation-turn"]',
    '[data-test-id*="message"]',
    '[role="article"]',
    'article',
    '.group',
    '[class*="message"]',
  ];

  function textOf(el) {
    if (!el) return '';
    // prefer markdown containers
    const md = el.querySelector('.markdown, [class*="markdown"], [class*="prose"], pre, .whitespace-pre-wrap');
    const raw = (md ? md.innerText : el.innerText) ?? '';
    return raw.trim();
  }

  function inferRole(el, idx) {
    const a = el.getAttribute?.('data-message-author-role') || el.getAttribute?.('data-role') || '';
    if (/assistant|bot|ai|model|gemini|claude/i.test(a)) return 'assistant';
    if (/user|human/i.test(a)) return 'user';
    // heuristic: check for "You" label or avatar
    const t = (el.innerText || '').slice(0, 400);
    if (/^You\s*$/m.test(t) || el.querySelector?.('[aria-label="You"]')) return 'user';
    // alternation fallback
    return idx % 2 === 0 ? 'user' : 'assistant';
  }

  function extractGeneric() {
    const seen = new Set();
    const out = [];
    // try multiple selector families
    const candidates = [];
    for (const sel of ROLE_ATTR_CANDIDATES) {
      try { document.querySelectorAll(sel).forEach(n => candidates.push(n)); } catch {}
    }
    // dedupe by element
    const uniq = [...new Set(candidates)].filter(el => {
      const txt = textOf(el);
      if (txt.length < 8) return false;
      if (seen.has(txt.slice(0, 120))) return false;
      seen.add(txt.slice(0, 120));
      return true;
    });
    // sort by document order (already), then map
    uniq.forEach((el, i) => {
      const content = textOf(el);
      if (!content || content.length < 2) return;
      // avoid capturing the whole page wrapper
      if (content.length > 18000) return;
      // skip if contains many child messages (wrapper)
      const childCount = el.querySelectorAll('[data-message-author-role]').length;
      if (childCount > 1) return;
      out.push({ role: inferRole(el, i), content });
    });
    // if nothing, try splitting main
    if (out.length === 0) {
      const main = document.querySelector('main, [role="main"], #__next, body');
      if (main) {
        const blocks = [...main.querySelectorAll('div, article, section')].map(textOf).filter(t => t.length > 40 && t.length < 6000);
        // naive split: alternate
        blocks.slice(0, 30).forEach((b, i) => out.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: b }));
      }
    }
    return out;
  }

  window.__OmniGeneric = { extractGeneric, textOf };
})();
