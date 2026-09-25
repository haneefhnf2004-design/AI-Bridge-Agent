/**
 * claude.js — claude.ai
 */
(function () {
  function extractClaude() {
    // Claude: [data-testid="user-message"] and assistant blocks .font-claude-message / [data-is-streaming]
    const out = [];
    const userNodes = document.querySelectorAll('[data-testid="user-message"], [data-test-render-count], div[class*="bg-bg-300"]');
    const assistantNodes = document.querySelectorAll('[class*="font-claude-message"], [data-is-streaming], .prose, [class*="grid-cols-1"]');
    // Primary: ordered groups
    const groups = document.querySelectorAll('[data-testid="user-message"], .group, [class*="message"]');
    // Try explicit claude selectors
    const explicitUsers = document.querySelectorAll('[data-testid="user-message"]');
    if (explicitUsers.length) {
      // For each user message, find next assistant sibling
      for (const u of explicitUsers) {
        const uc = (u.innerText || '').trim();
        if (uc) out.push({ role: 'user', content: uc });
        // walk to next assistant
        let sib = u.parentElement?.nextElementSibling;
        let tries = 0;
        while (sib && tries < 6) {
          const txt = (sib.innerText || '').trim();
          const isAssistant = sib.querySelector?.('.prose, [class*="font-claude"]') || (txt.length > 30 && !sib.querySelector?.('[data-testid="user-message"]'));
          if (isAssistant && txt.length > 10) { out.push({ role: 'assistant', content: txt }); break; }
          sib = sib.nextElementSibling; tries++;
        }
      }
      if (out.length) return out;
    }
    // Fallback: all message-like divs in order
    const all = [...document.querySelectorAll('div[class*="group"], div[data-test-render-count], article')];
    const cand = all.map(n => (n.innerText || '').trim()).filter(t => t.length > 20 && t.length < 10000);
    // Heuristic: dedupe and alternate - but prefer to use DOM order of [data-testid]
    if (cand.length >= 2) {
      // take first 30 unique
      const seen = new Set(); const uniq = [];
      for (const c of cand) { const k=c.slice(0,80); if(!seen.has(k)){seen.add(k); uniq.push(c);} if(uniq.length>=30) break; }
      // if we have user markers, alternate starting with user
      return uniq.slice(0, 24).map((c, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: c }));
    }
    return window.__OmniGeneric ? window.__OmniGeneric.extractGeneric() : [];
  }
  window.__OmniClaude = { extractClaude };
})();
