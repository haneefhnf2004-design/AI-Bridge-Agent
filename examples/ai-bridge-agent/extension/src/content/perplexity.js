/**
 * perplexity.js — perplexity.ai
 */
(function () {
  function extractPerplexity() {
    const out = [];
    // Perplexity: user query in [class*="query"] or heading, answer in [class*="prose"] / [data-test-id="answer"]
    const qNodes = document.querySelectorAll('[class*="queryBox"], h1, h2, [placeholder*="Ask"], div[class*="question"]');
    const aNodes = document.querySelectorAll('[class*="prose"], [class*="answer"], div[class*="default-markdown"]');
    // Ordered extraction via thread container
    const thread = document.querySelector('main, [class*="thread"], [class*="conversation"]');
    if (thread) {
      const blocks = [...thread.querySelectorAll('div')].map(n => (n.innerText || '').trim()).filter(t => t.length > 30 && t.length < 12000);
      // perplexity often has 1 user + 1 long answer per turn — dedupe
      const seen = new Set(); const uniq = [];
      for (const b of blocks) { const k=b.slice(0,100); if(!seen.has(k) && b.split('\n').length < 60){ seen.add(k); uniq.push(b);} if(uniq.length>30) break; }
      // Heuristic: alternate if we can detect Q/A split
      if (uniq.length >= 2) {
        // Try to detect query vs answer by length/citations
        const mapped = uniq.slice(0, 20).map((c, i) => {
          const isAnswer = c.length > 400 || /Sources|References|Related/i.test(c);
          return { role: isAnswer ? 'assistant' : 'user', content: c };
        });
        // ensure starts with user
        if (mapped[0]?.role === 'assistant' && mapped.length > 1) mapped.unshift({ role:'user', content: uniq[0].slice(0, 600) });
        if (mapped.length >= 2) return mapped;
      }
    }
    if (qNodes.length || aNodes.length) {
      const qs = [...qNodes].map(n => (n.innerText||'').trim()).filter(Boolean).slice(0, 15);
      const as = [...aNodes].map(n => (n.innerText||'').trim()).filter(t=>t.length>40).slice(0, 15);
      const max = Math.max(qs.length, as.length);
      for (let i=0;i<max;i++){ if(qs[i]) out.push({role:'user', content:qs[i]}); if(as[i]) out.push({role:'assistant', content:as[i]}); }
      if(out.length) return out;
    }
    return window.__OmniGeneric ? window.__OmniGeneric.extractGeneric() : [];
  }
  window.__OmniPerplexity = { extractPerplexity };
})();
