/* AI Bridge Agent — Unified app.js for all pages (index, chat, models, detail) */

// ---------- Theme (light default, persist in localStorage) ----------
function initTheme(){
  let t='light';
  try{ t=localStorage.getItem('aibridge_theme')||'light'; }catch(e){}
  document.documentElement.setAttribute('data-theme', t);
  const btn=document.getElementById('themeToggle');
  if(btn) btn.textContent = t==='dark' ? '☀' : '🌙';
  if(btn && !btn.dataset.wired){
    btn.dataset.wired='1';
    btn.addEventListener('click', ()=>{
      const cur=document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      try{ localStorage.setItem('aibridge_theme', cur); }catch(e){}
      btn.textContent = cur==='dark' ? '☀' : '🌙';
    });
  }
}
initTheme();

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- Extended Model Catalog (20 real-world cards representing Universal AI Network) ----------
const CATALOG = [
  { id:'auto', name:'AUTO — Best for this task', provider:'bridge', icon:'◈', color:'#2563EB', desc:'Smart 16-factor scorer. Picks the best model for your prompt automatically.', price:'Free via AUTO', rating:4.9, tags:['free','fast'], context:'128K', caps:['Auto-routing','Multi-provider','Fast'] },
  { id:'auto/coding', name:'AUTO / Coding', provider:'bridge', icon:'⚡', color:'#1E293B', desc:'Optimized for code generation, debugging, and refactoring.', price:'Free', rating:4.8, tags:['coding','free'], context:'128K', caps:['Code','Debugging','Refactor'] },
  { id:'openai/gpt-4o', name:'GPT-4o', provider:'openai', icon:'◐', color:'#2563EB', desc:'OpenAI flagship — vision, code, reasoning, speed.', price:'$5 / 1M in', rating:4.8, tags:['vision','coding','fast'], context:'128K', caps:['Vision','Code','Reasoning'] },
  { id:'openai/gpt-4o-mini', name:'GPT-4o mini', provider:'openai', icon:'○', color:'#0EA5E9', desc:'Fast & cheap — great for everyday chat and summarization.', price:'$0.15 / 1M', rating:4.6, tags:['free','fast'], context:'128K', caps:['Fast','Cheap','Summarize'] },
  { id:'openai/o1', name:'o1 — Reasoning', provider:'openai', icon:'⬢', color:'#1E293B', desc:'Deep reasoning model for complex problem solving.', price:'$15 / 1M', rating:4.9, tags:['coding'], context:'200K', caps:['Reasoning','Math','Planning'] },
  { id:'anthropic/claude-3.5-sonnet', name:'Claude 3.5 Sonnet', provider:'anthropic', icon:'✦', color:'#14532D', desc:'Best for writing, nuanced reasoning, and long documents.', price:'$3 / 1M', rating:4.9, tags:['vision','long','coding'], context:'200K', caps:['Writing','Reasoning','Vision'] },
  { id:'anthropic/claude-3-haiku', name:'Claude 3 Haiku', provider:'anthropic', icon:'✧', color:'#14B8A6', desc:'Lightning fast Claude — ideal for quick answers.', price:'$0.25 / 1M', rating:4.5, tags:['fast','free'], context:'200K', caps:['Fast','Cheap','Chat'] },
  { id:'google/gemini-2.0-flash', name:'Gemini 2.0 Flash', provider:'google', icon:'⬣', color:'#0EA5E9', desc:'Google fastest — multimodal, huge context.', price:'Free tier', rating:4.7, tags:['vision','fast','long'], context:'1M', caps:['Vision','Speed','Long context'] },
  { id:'google/gemini-1.5-pro', name:'Gemini 1.5 Pro', provider:'google', icon:'⬔', color:'#0EA5E9', desc:'Powerful reasoning with 2M context window.', price:'$1.25 / 1M', rating:4.7, tags:['long','vision'], context:'2M', caps:['Long context','Vision','Reasoning'] },
  { id:'meta-llama/llama-3.3-70b-instruct', name:'Llama 3.3 70B', provider:'meta-llama', icon:'🦙', color:'#475569', desc:'Open-source powerhouse — great for self-hosting.', price:'Free / $0.6', rating:4.6, tags:['free','coding'], context:'128K', caps:['Open source','Code','Chat'] },
  { id:'meta-llama/llama-3.1-405b', name:'Llama 3.1 405B', provider:'meta-llama', icon:'🦙', color:'#1E293B', desc:'Largest open model — frontier capability.', price:'$3 / 1M', rating:4.8, tags:['coding','long'], context:'128K', caps:['Frontier','Code','Reasoning'] },
  { id:'deepseek/deepseek-v3', name:'DeepSeek V3', provider:'deepseek', icon:'⬡', color:'#0EA5E9', desc:'Top coding & math — unbeatable value.', price:'$0.27 / 1M', rating:4.8, tags:['coding','free'], context:'128K', caps:['Coding','Math','Cheap'] },
  { id:'deepseek/deepseek-r1', name:'DeepSeek R1', provider:'deepseek', icon:'⬢', color:'#0EA5E9', desc:'Reasoning distilled — o1 rival, open.', price:'$0.55 / 1M', rating:4.8, tags:['coding'], context:'128K', caps:['Reasoning','Chain-of-thought','Code'] },
  { id:'mistralai/mistral-large', name:'Mistral Large', provider:'mistralai', icon:'🌬', color:'#334155', desc:'European flagship — balanced and fast.', price:'$2 / 1M', rating:4.6, tags:['fast','vision'], context:'128K', caps:['Balanced','Speed','Multilingual'] },
  { id:'mistralai/mistral-small', name:'Mistral Small', provider:'mistralai', icon:'🍃', color:'#14532D', desc:'Edge-ready small model, very fast.', price:'Free', rating:4.4, tags:['free','fast'], context:'32K', caps:['Fast','Edge','Cheap'] },
  { id:'cohere/command-r-plus', name:'Command R+', provider:'cohere', icon:'⬔', color:'#134E4A', desc:'RAG & tool-use specialist.', price:'$3 / 1M', rating:4.5, tags:['long'], context:'128K', caps:['RAG','Tools','Enterprise'] },
  { id:'perplexity/llama-3.1-sonar-large-128k-online', name:'Sonar Large Online', provider:'perplexity', icon:'🔍', color:'#0f172a', desc:'Search-augmented — real-time web search.', price:'$1 / 1M', rating:4.5, tags:['fast'], context:'128K', caps:['Web search','Realtime','Answers'] },
  { id:'qwen/qwen-2.5-72b-instruct', name:'Qwen 2.5 72B', provider:'qwen', icon:'⭓', color:'#475569', desc:'Alibaba flagship — excellent multilingual & code.', price:'$0.35 / 1M', rating:4.6, tags:['coding','free'], context:'128K', caps:['Multilingual','Code','Vision'] },
  { id:'x-ai/grok-2', name:'Grok 2', provider:'x-ai', icon:'✕', color:'#1E293B', desc:'Witty, real-time, with web access.', price:'$5 / 1M', rating:4.5, tags:['vision'], context:'131K', caps:['Realtime','Witty','Vision'] },
  { id:'fusion', name:'FUSION — Ensemble', provider:'bridge', icon:'⬢', color:'#2563EB', desc:'Ensemble of top models — best quality at premium.', price:'$8 / 1M', rating:4.9, tags:['coding','vision','long'], context:'200K', caps:['Ensemble','Best quality','Fusion'] },
  { id:'meta-llama/codellama-70b-instruct', name:'Code Llama 70B', provider:'meta-llama', icon:'💻', color:'#0EA5E9', desc:'Meta code specialist — GitHub-grade completion, debugging, refactor.', price:'Free tier', rating:4.7, tags:['coding','free'], context:'16K', caps:['Code','GitHub','Debug'] },
  { id:'bigcode/starcoder2-15b', name:'StarCoder2 15B', provider:'bigcode', icon:'⭐', color:'#14B8A6', desc:'Open code model trained on GitHub — fast completions.', price:'Free', rating:4.5, tags:['coding','free','fast'], context:'16K', caps:['Code','GitHub','Fast'] },
  { id:'mistralai/codestral-latest', name:'Codestral', provider:'mistralai', icon:'🔧', color:'#475569', desc:'Mistral code model — fill-in-the-middle, multi-language.', price:'$0.3 / 1M', rating:4.6, tags:['coding','fast'], context:'32K', caps:['Code','Autocomplete','Fast'] },
  { id:'deepseek/deepseek-coder-v2', name:'DeepSeek Coder V2', provider:'deepseek', icon:'🛠', color:'#1E293B', desc:'Math + code expert — repos, PRs, GitHub workflows.', price:'$0.14 / 1M', rating:4.7, tags:['coding','free'], context:'128K', caps:['Code','GitHub','Math'] },
];

// Brand logos (Simple Icons paths, embedded for offline use). Fallback: text glyph.
const LOGOS = {
  openai: { vb: '0 0 24 24', d: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z' },
  anthropic: { vb: '0 0 24 24', d: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z' },
  google: { vb: '0 0 24 24', d: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z' },
  meta: { vb: '0 0 24 24', d: 'M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z' },
  microsoft: { vb: '0 0 24 24', d: 'M0 0v11.408h11.408V0zm12.594 0v11.408H24V0zM0 12.594V24h11.408V12.594zm12.594 0V24H24V12.594z' },
  deepseek: { vb: '0 0 24 24', d: 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45' },
  mistralai: { vb: '0 0 24 24', d: 'M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z' },
  perplexity: { vb: '0 0 24 24', d: 'M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z' },
  x: { vb: '0 0 24 24', d: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z' },
  qwen: { vb: '0 0 24 24', d: 'M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z' },
};
const LOGO_PROVIDER = {
  openai: 'openai', anthropic: 'anthropic', google: 'google', 'meta-llama': 'meta',
  microsoft: 'microsoft', deepseek: 'deepseek', mistralai: 'mistralai',
  perplexity: 'perplexity', 'x-ai': 'x', qwen: 'qwen',
};
function logoFor(provider, fallbackGlyph) {
  if (provider === 'bridge') return '<img class="mlogo-img" src="/logo.svg" alt="AI Bridge">';
  const key = LOGO_PROVIDER[provider];
  const L = key && LOGOS[key];
  if (!L) return esc(fallbackGlyph);
  return `<svg class="mlogo" viewBox="${L.vb}" fill="#fff" aria-hidden="true"><path d="${L.d}"/></svg>`;
}

const EXAMPLES = {
  code: [
    { role:'user', content:'My React useEffect keeps firing infinitely. Here is the code:\n\n```js\nuseEffect(()=>{ fetchData(); }, [data])\n```\nHow do I fix it?' },
    { role:'assistant', content:'You have `data` in the dependency array but you also set `data` inside `fetchData`, causing a loop. Remove `data` from deps or use a ref / useCallback.' },
    { role:'user', content:'Show me the corrected code with useCallback and loading state.' },
  ],
  reason: [
    { role:'user', content:'We need to decide between microservices vs modular monolith for a team of 8 building a real-time trading platform. Compare tradeoffs for latency, deploy, and data consistency.' },
    { role:'assistant', content:'Latency favors monolith (in-process), deploy favors microservices (independent), consistency is easier in monolith (single DB + transactions). For 8 people + real-time, start modular monolith with clear boundaries, extract services when bounded contexts mature.' },
    { role:'user', content:'Give a concrete migration plan with 3 phases and metrics to watch.' },
  ],
  long: [
    { role:'user', content:'Summarize this meeting transcript (20k tokens, truncated): [Board sync: Q1 revenue +12% but churn up 3% in SMB. Action: expand success team, ship SSO. Risks: vendor lock-in...]' },
    { role:'assistant', content:'Summary: Revenue up, churn risk in SMB. Actions: expand CS, SSO. Risks: lock-in. Open questions: pricing.' },
    { role:'user', content:'Now draft a one-page memo with owners and dates.' },
  ],
  quick: [
    { role:'user', content:'Translate to French and make it more formal: "Hey, can you send the report by tonight? Thanks!"' },
    { role:'assistant', content:'"Bonsoir, pourriez-vous envoyer le rapport d\'ici ce soir ? Merci beaucoup !"' },
    { role:'user', content:'Now make an even shorter SMS version.' },
  ],
};

// ---------- Shared helpers ----------
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function estTokens(t){ return Math.ceil((t?.length??0)/4); }
function estMsgsTokens(ms){ return ms.reduce((a,m)=>a+estTokens(m.content)+4,0); }
function getQ(k){ return new URLSearchParams(location.search).get(k); }
function idToModel(id){ return CATALOG.find(m=>m.id===id) || CATALOG[0]; }

// Hamburger
['hamburger','hamburger2','hamburger3','hamburger4'].forEach(id=>{
  const btn=document.getElementById(id);
  if(!btn) return;
  const linkId=id.replace('hamburger','navLinks');
  btn.addEventListener('click',()=>{
    const nl=document.getElementById(linkId);
    if(nl) nl.classList.toggle('open');
  });
});
// SW + PWA
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt=e;
  const b=document.getElementById('pwaBanner');
  if(b) b.classList.remove('hidden');
});
document.getElementById('pwaInstallBtn')?.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  document.getElementById('pwaBanner')?.classList.add('hidden');
});

// Model card HTML
function cardHTML(m){
  const freeTag=m.tags.includes('free')?'<span class="badge free">Free</span>':'';
  const fastTag=m.tags.includes('fast')?'<span class="badge fast">Fast</span>':'';
  const codeTag=m.tags.includes('coding')?'<span class="badge code">Code</span>':'';
  return `<div class="mcard" data-id="${esc(m.id)}">
    <div class="mcard-top">
      <div class="micon" style="background:${m.color}">${logoFor(m.provider, m.icon)}</div>
      <div style="flex:1;min-width:0"><div class="mname">${esc(m.name)}</div><div class="mprov">${esc(m.provider)} · ${esc(m.context)}</div></div>
      <span class="rating">★ ${m.rating}</span>
    </div>
    <div class="mdesc">${esc(m.desc)}</div>
    <div class="mmeta">${freeTag}${fastTag}${codeTag}<span class="badge">${esc(m.price)}</span></div>
    <div class="mactions"><a class="btn primary small" href="/model-detail?id=${encodeURIComponent(m.id)}">Details</a><a class="btn ghost small" href="/chat?model=${encodeURIComponent(m.id)}">Chat →</a></div>
  </div>`;
}

// ---------- Detect page ----------
const path = location.pathname;
const isIndex = path==='/' || path==='/index.html';
const isChat = path.includes('chat');
const isModels = path.includes('models.html') || path==='/models';
const isDetail = path.includes('model-detail');
const isProviders = path.includes('providers');
const isResilience = path.includes('resilience');
const isMcp = path.includes('mcp') && !path.includes('model');
// new pages use inline scripts; no app.js handling needed — prevent fallthrough errors
if(isProviders || isResilience || isMcp){ /* handled inline in respective html */ }

// ---------- INDEX: hero search + featured + bridge ----------
if(isIndex){
  const heroSearch=$('#heroSearch');
  const featuredGrid=$('#featuredGrid');
  const sourceSel=$('#sourceSel');
  const exampleSel=$('#exampleSel');
  const messagesInput=$('#messagesInput');
  const msgStats=$('#msgStats');
  const preview=$('#preview');
  const modelSel=$('#modelSel');
  const routeExplain=$('#routeExplain');
  const cheapCheck=$('#cheapCheck');
  const tempInput=$('#tempInput');
  const maxTokInput=$('#maxTokInput');
  const transferBtn=$('#transferBtn');
  const progress=$('#progress');
  const barFill=$('#barFill');
  const progressText=$('#progressText');
  const resultWrap=$('#resultWrap');
  const resultText=$('#resultText');
  const resultMeta=$('#resultMeta');
  const detailsText=$('#detailsText');
  const copyBtn=$('#copyBtn');
  const formatBtn=$('#formatBtn');
  const clearBtn=$('#clearBtn');
  const healthDot=$('#healthDot');
  const healthText=$('#healthText');

  const MODEL_GROUPS=[
    {label:'★ Bridge Engine Smart', models: CATALOG.filter(m=>m.id.startsWith('auto')||m.id==='fusion')},
    {label:'OpenAI', models: CATALOG.filter(m=>m.provider==='openai')},
    {label:'Anthropic', models: CATALOG.filter(m=>m.provider==='anthropic')},
    {label:'Google', models: CATALOG.filter(m=>m.provider==='google')},
    {label:'Open & Others', models: CATALOG.filter(m=>['meta-llama','deepseek','mistralai','cohere','perplexity','qwen','x-ai'].includes(m.provider))},
  ];
  function populate(select, def='auto'){
    if(!select) return;
    select.innerHTML='';
    for(const g of MODEL_GROUPS){
      const og=document.createElement('optgroup'); og.label=g.label;
      for(const m of g.models){ const o=document.createElement('option'); o.value=m.id; o.textContent=m.name; if(m.id===def) o.selected=true; og.appendChild(o); }
      select.appendChild(og);
    }
  }
  populate(modelSel,'auto');

  function renderFeatured(filter=''){
    if(!featuredGrid) return;
    const q=filter.toLowerCase().trim();
    let list=CATALOG;
    if(q) list=CATALOG.filter(m=>[m.name,m.provider,m.desc,m.id,m.tags.join(' ')].join(' ').toLowerCase().includes(q));
    featuredGrid.innerHTML = list.slice(0,12).map(cardHTML).join('') || '<div class="hint">No models match.</div>';
  }
  renderFeatured();
  // live search
  heroSearch?.addEventListener('input',()=> renderFeatured(heroSearch.value));
  $('#heroSearchBtn')?.addEventListener('click',()=>{
    const q=heroSearch.value.trim();
    if(q) location.href='/models?q='+encodeURIComponent(q);
    else location.href='/models';
  });
  heroSearch?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); $('#heroSearchBtn')?.click(); }});

  // bridge logic (shared)
  function parseMessages(){
    const raw=messagesInput.value.trim();
    if(!raw) return [];
    try{ const j=JSON.parse(raw); if(Array.isArray(j)) return j.filter(m=>m&&typeof m.content==='string'); if(j&&Array.isArray(j.messages)) return j.messages.filter(m=>m&&typeof m.content==='string'); }catch{}
    if(raw.length>4) return [{role:'user', content: raw}];
    return [];
  }
  function analyzeType(msgs){
    const text=msgs.map(m=>m.content).join('\n').slice(0,6000);
    if(/(code|function|class|api|bug|error|stack ?trace|typescript|javascript|python|react|node|sql|regex|algorithm|refactor|debug|implement)/i.test(text)) return 'coding';
    if(/(summarize|long document|paper|pdf|book|transcript)/i.test(text) || text.length>8000) return 'long-context';
    if(/(prove|reason|logic|math|solve|analyze|compare|evaluate)/i.test(text)) return 'reasoning';
    if(/(quick|fast|short answer|tl;dr|translate|rephrase)/i.test(text)) return 'fast';
    return 'general';
  }
  function renderStats(){
    if(!msgStats) return;
    const msgs=parseMessages();
    const toks=estMsgsTokens(msgs);
    const chars=msgs.reduce((a,m)=>a+m.content.length,0);
    msgStats.textContent=`${msgs.length} messages · ${toks.toLocaleString()} tokens est. · ${chars.toLocaleString()} chars${toks>6000?' · context auto-optimized':''}`;
    if(routeExplain){
      const t=analyzeType(msgs);
      const map={coding:'Code → auto/coding', reasoning:'Reasoning → auto', 'long-context':'Long → auto/long-context', fast:'Quick → auto/fast', general:'General → auto'};
      routeExplain.textContent = msgs.length ? `${map[t]??map.general}  →  ${modelSel.value}` : 'Paste a conversation to see routing.';
    }
    if(preview){
      preview.innerHTML='';
      const slice=msgs.slice(-6);
      for(const m of slice){
        const d=document.createElement('div'); d.className=`msg msg--${m.role==='assistant'?'assistant':'user'}`;
        d.innerHTML=`<div class="msg-role">${(m.role||'user').toUpperCase()}</div>${esc(m.content.slice(0,500))}${m.content.length>500?'…':''}`;
        preview.appendChild(d);
      }
      if(msgs.length>6){ const h=document.createElement('div'); h.className='hint'; h.textContent=`+ ${msgs.length-6} earlier messages`; preview.prepend(h); }
      if(!msgs.length){ preview.innerHTML='<div class="hint">👆 Paste your chat above — plain copy-paste is enough! Or pick an example to try instantly.</div>'; }
    }
  }
  messagesInput?.addEventListener('input', renderStats);
  modelSel?.addEventListener('change', renderStats);
  exampleSel?.addEventListener('change', ()=>{
    const k=exampleSel.value; if(!k) return;
    const ex=EXAMPLES[k]; if(ex) { messagesInput.value=JSON.stringify(ex,null,2); renderStats(); }
  });
  formatBtn?.addEventListener('click', ()=>{
    try{ const j=JSON.parse(messagesInput.value); messagesInput.value=JSON.stringify(j,null,2); renderStats(); }catch{ alert('Not valid JSON — treating as plain text'); }
  });
  clearBtn?.addEventListener('click', ()=>{ messagesInput.value=''; renderStats(); });
  $('#openChatBtn')?.addEventListener('click', ()=>{
    const msgs=parseMessages();
    if(msgs.length){ try{ localStorage.setItem('aibridge_bridge_msgs', JSON.stringify(msgs)); }catch{} }
    const m=modelSel.value||'auto';
    location.href='/chat?model='+encodeURIComponent(m);
  });
  function setProgress(pct, text){ if(progress){ progress.classList.remove('hidden'); barFill.style.width=`${pct}%`; progressText.textContent=text; } }
  async function doTransfer(){
    const msgs=parseMessages();
    if(!msgs.length){ alert('Paste a conversation first (JSON array of {role, content}).'); return; }
    let model=modelSel.value||'auto';
    if(cheapCheck?.checked && model==='auto') model='auto/cheap';
    transferBtn.disabled=true; resultWrap?.classList.add('hidden');
    setProgress(22, `Routing (${analyzeType(msgs)}) → ${model} …`);
    await new Promise(r=>setTimeout(r,220));
    setProgress(48, 'Memory: clean → RTK/Caveman → summarize if needed …');
    await new Promise(r=>setTimeout(r,160));
    setProgress(72, `Calling POST /api/transfer → Bridge Engine ${model} …`);
    try{
      const body={ messages: msgs, model, temperature: Number(tempInput.value)||0.7, max_tokens: Number(maxTokInput.value)||2048, summary: document.getElementById('summaryCheck')?.checked || undefined };
      const r=await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||`HTTP ${r.status}`);
      setProgress(100, `Done via ${j.provider} · ${j.model}`);
      resultText.textContent=j.content||JSON.stringify(j,null,2);
      if(resultMeta) resultMeta.textContent=`${j.model} · ${j.provider} · ${j.memory?`${j.memory.finalTokens} tok` :''}`;
      if(detailsText) detailsText.textContent=JSON.stringify({ routing: j.routing, memory: j.memory, usage: j.usage, error: j.error, circuit: j.circuit }, null, 2);
      resultWrap?.classList.remove('hidden');
      setTimeout(()=>{ progress?.classList.add('hidden'); barFill.style.width='0%'; }, 1700);
    }catch(e){
      setProgress(100, `Error: ${String(e.message).slice(0,140)}`);
      if(resultText) resultText.textContent=`Transfer failed:\n${String(e.message)}\n\n- Is backend running?  npm --workspace backend run dev  (port 8787)\n- Is Bridge Engine running?  bridge-engine start  (port 20128)\n- Check /api/health`;
      if(resultMeta) resultMeta.textContent='error';
      if(detailsText) detailsText.textContent=String(e.stack||e);
      resultWrap?.classList.remove('hidden');
    }finally{ transferBtn.disabled=false; }
  }
  transferBtn?.addEventListener('click', doTransfer);
  copyBtn?.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(resultText.textContent); copyBtn.textContent='Copied!'; setTimeout(()=>copyBtn.textContent='Copy',1100);}catch{} });

  async function refreshHealth(){
    try{
      const r=await fetch('/api/health'); const j=await r.json();
      if(j.bridge_ok){ healthDot.className='dot dot--on'; healthText.textContent=`Bridge Engine OK · ${j.models??'?'} models`; const ls=$('#liveStat'); if(ls) ls.textContent=`● ${j.models??'?'} models live`; }
      else { healthDot.className='dot dot--on'; healthText.textContent=`⚡ AI Bridge • auto ready · ${j.models??'auto'} models`; const ls=$('#liveStat'); if(ls) ls.textContent=`● AI Bridge ready`; }
    }catch{
      try{ const r2=await fetch('/api/models'); if(r2.ok){ healthDot.className='dot dot--on'; healthText.textContent='Bridge Engine direct OK'; return; } }catch{}
      healthDot.className='dot dot--off'; healthText.textContent='Offline — start backend (:8787) or Bridge Engine ()';
    }
  }
  async function loadModels(){
    try{
      const r=await fetch('/api/models'); const j=await r.json();
      if(Array.isArray(j.data) && j.data.length){
        const cur=modelSel.value;
        const live=j.data.slice(0,22);
        modelSel.innerHTML='';
        const og=document.createElement('optgroup'); og.label='★ Bridge Engine Smart';
        for(const m of MODEL_GROUPS[0].models){ const o=document.createElement('option'); o.value=m.id; o.textContent=m.name; if(m.id===cur) o.selected=true; og.appendChild(o); }
        modelSel.appendChild(og);
        const og2=document.createElement('optgroup'); og2.label=`Live from ${j.source} (${j.count})`;
        for(const m of live){ if(MODEL_GROUPS[0].models.some(x=>x.id===m.id)) continue; const o=document.createElement('option'); o.value=m.id; o.textContent=m.name||m.id; if(m.id===cur) o.selected=true; og2.appendChild(o); }
        modelSel.appendChild(og2);
      }
    }catch{}
  }
  // init index
  renderStats(); refreshHealth(); loadModels(); setInterval(refreshHealth, 9000);
  // seed example if empty
  if(!messagesInput.value.trim()){ messagesInput.value=JSON.stringify(EXAMPLES.code,null,2); renderStats(); }
  // handle ?q prefill
  const q0=getQ('q'); if(q0 && heroSearch){ heroSearch.value=q0; renderFeatured(q0); }
}

// ---------- CHAT PAGE ----------
if(isChat){
  const chatModelSel=$('#chatModelSel');
  const chatModelInfo=$('#chatModelInfo');
  const chatStream=$('#chatStream');
  const chatInput=$('#chatInput');
  const sendBtn=$('#sendBtn');
  const histList=$('#histList');
  const tokenInfo=$('#tokenInfo');
  const healthDot2=$('#healthDot2');
  const healthText2=$('#healthText2');
  const bridgeModal=$('#bridgeModal');
  const bridgeTextarea=$('#bridgeTextarea');
  const chatSide=$('#chatSide');

  // dynamic placeholder
  if(chatInput) chatInput.placeholder = 'Message AI Bridge...';

  // model selector
  function popChatModels(def){
    if(!chatModelSel) return;
    const fromQ=getQ('model');
    const chosen=def||fromQ||localStorage.getItem('aibridge_model')||'auto';
    chatModelSel.innerHTML='';
    const groups=[
      {label:'★ AUTO', models: CATALOG.filter(m=>m.id.startsWith('auto')||m.id==='fusion')},
      {label:'OpenAI', models: CATALOG.filter(m=>m.provider==='openai')},
      {label:'Anthropic', models: CATALOG.filter(m=>m.provider==='anthropic')},
      {label:'Google', models: CATALOG.filter(m=>m.provider==='google')},
      {label:'Others', models: CATALOG.filter(m=>!['bridge','openai','anthropic','google'].includes(m.provider))},
    ];
    for(const g of groups){
      const og=document.createElement('optgroup'); og.label=g.label;
      for(const m of g.models){ const o=document.createElement('option'); o.value=m.id; o.textContent=m.name; if(m.id===chosen) o.selected=true; og.appendChild(o); }
      chatModelSel.appendChild(og);
    }
    updateModelInfo();
  }
  function updateModelInfo(){
    const m=idToModel(chatModelSel.value);
    const nm=document.getElementById('chatModelName'); if(nm) nm.textContent=m.name;
    if(chatModelInfo) chatModelInfo.textContent=`${m.provider} · ${m.context} · ${m.price} · ${m.caps.join(' · ')}`;
    try{ localStorage.setItem('aibridge_model', chatModelSel.value); }catch{}
  }
  chatModelSel?.addEventListener('change', updateModelInfo);
  popChatModels();

  // history — real titles = first 30 chars of first user message
  let sessions = [];
  try{ sessions = JSON.parse(localStorage.getItem('aibridge_sessions')||'[]'); if(!Array.isArray(sessions)) sessions=[]; }catch{ sessions=[]; }
  let activeId = localStorage.getItem('aibridge_active') || null;
  let messages = [];
  // store per-message meta for footer rendering
  let lastMeta = null;

  function saveSessions(){
    try{
      localStorage.setItem('aibridge_sessions', JSON.stringify(sessions));
      if(activeId) localStorage.setItem('aibridge_active', activeId);
    }catch{}
  }
  function titleFromMessages(ms){
    const firstUser = ms.find(m=>m.role==='user')?.content || 'New chat';
    const t = firstUser.trim().slice(0,30);
    return t || 'New chat';
  }
  function newSession(prefill=[]){
    const id='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const title=titleFromMessages(prefill);
    const s={id, title, at: new Date().toISOString(), messages: prefill};
    sessions.unshift(s); activeId=id; saveSessions(); renderHist(); loadSession(id);
  }
  function loadSession(id){
    const s=sessions.find(x=>x.id===id);
    if(!s) return;
    activeId=id; messages=[...s.messages]; saveSessions(); renderHist(); renderStream();
  }
  function persistActive(){
    const s=sessions.find(x=>x.id===activeId);
    if(s){ s.messages=[...messages]; s.title=titleFromMessages(messages); }
    saveSessions(); renderHist(); updateTokenInfo();
  }
  function renderHist(){
    if(!histList) return;
    histList.innerHTML='';
    for(const s of sessions){
      const d=document.createElement('div'); d.className='hist-item'+(s.id===activeId?' active':'');
      d.innerHTML=`<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.title)}</div><div class="hint">${s.messages.length} msgs · ${new Date(s.at).toLocaleDateString()}</div>`;
      d.addEventListener('click',()=> loadSession(s.id));
      histList.appendChild(d);
    }
    if(!sessions.length) histList.innerHTML='<div class="hint">No chats yet. Start typing below.</div>';
  }

  // ---------- Markdown renderer ----------
  function mdToHtml(md){
    if(!md) return '';
    // preserve code blocks
    const blocks=[];
    let tmp = md.replace(/```(\w+)?\n?([\s\S]*?)```/g, (m, lang, code)=>{
      const idx = blocks.length;
      blocks.push(`<pre><code class="lang-${esc(lang||'')}">${esc(code.trim())}</code></pre>`);
      return `__CODEBLOCK_${idx}__`;
    });
    tmp = esc(tmp);
    // inline code
    tmp = tmp.replace(/`([^`]+?)`/g, '<code>$1</code>');
    // bold
    tmp = tmp.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // italic (single *)
    tmp = tmp.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    // restore code blocks
    tmp = tmp.replace(/__CODEBLOCK_(\d+)__/g, (m,i)=> blocks[Number(i)]||'');
    // lists: - item or * item or 1. item
    const lines = tmp.split('\n');
    let html=''; let inUl=false; let inOl=false;
    function closeLists(){
      if(inUl){ html+='</ul>'; inUl=false; }
      if(inOl){ html+='</ol>'; inOl=false; }
    }
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      const ulMatch = line.match(/^\s*[-•]\s+(.*)/);
      const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
      if(blocks.some(b=>line.includes(b.slice(0,20)))){ closeLists(); html+=line; continue; }
      if(ulMatch){
        if(!inUl){ closeLists(); html+='<ul>'; inUl=true; }
        html+=`<li>${ulMatch[1]}</li>`;
      } else if(olMatch){
        if(!inOl){ closeLists(); html+='<ol>'; inOl=true; }
        html+=`<li>${olMatch[1]}</li>`;
      } else if(line.trim()===''){
        closeLists(); html+='<br/>';
      } else {
        closeLists();
        // if already html block (pre) keep as is
        if(line.includes('<pre>')) html+=line;
        else html+=`<p>${line}</p>`;
      }
    }
    closeLists();
    // clean empty p around pre
    html = html.replace(/<p><pre>/g,'<pre>').replace(/<\/pre><\/p>/g,'</pre>');
    html = html.replace(/<p><br\/><\/p>/g,'');
    return html;
  }
  function formatTime(d=new Date()){
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }

  // ---------- Render stream with avatars, actions, meta ----------
  function createMessageRow(role, content, opts={}){
    const row=document.createElement('div');
    row.className='msg-row '+(role==='user'?'user':'assistant');
    if(role==='system'){
      row.className='msg-row system';
      row.innerHTML=`<div class="bubble system">${esc(content)}</div>`;
      return row;
    }
    const avatar=document.createElement('div');
    avatar.className='avatar '+(role==='user'?'user':'assistant');
    avatar.textContent = role==='user' ? 'You' : '⚡';

    const col=document.createElement('div');
    col.className='msg-col';

    const bubble=document.createElement('div');
    bubble.className='bubble '+(role==='user'?'user':'assistant');
    if(role==='assistant'){
      bubble.innerHTML=`<div class="md">${mdToHtml(content)}</div>`;
    } else {
      // user: plain text with markdown-lite but keep safe
      bubble.innerHTML=`<div class="md">${mdToHtml(content)}</div>`;
    }

    col.appendChild(bubble);

    // actions bar for assistant
    if(role==='assistant'){
      const actions=document.createElement('div');
      actions.className='msg-actions';
      const ts=document.createElement('span'); ts.className='ts'; ts.textContent=formatTime(opts.at||new Date());
      actions.innerHTML=`
        <button class="act-copy" title="Copy">⎘ Copy</button>
        <button class="act-regen" title="Regenerate">↻ Regenerate</button>
        <button class="act-like" title="Like">👍</button>
        <button class="act-dislike" title="Dislike">👎</button>
      `;
      actions.appendChild(ts);
      // wire copy
      actions.querySelector('.act-copy').addEventListener('click', async ()=>{
        try{ await navigator.clipboard.writeText(content); const b=actions.querySelector('.act-copy'); b.textContent='✓ Copied'; setTimeout(()=>b.textContent='⎘ Copy',1200);}catch{}
      });
      actions.querySelector('.act-regen').addEventListener('click', ()=>{
        // regenerate last response
        regenerateLast();
      });
      actions.querySelector('.act-like').addEventListener('click', (e)=>{ e.target.style.color='var(--accent)'; e.target.textContent='👍 Liked'; });
      actions.querySelector('.act-dislike').addEventListener('click', (e)=>{ e.target.style.color='#ef4444'; });
      col.appendChild(actions);

      // footer meta bar (outside bubble, subtle)
      if(opts.meta){
        const meta=document.createElement('div');
        meta.className='meta-bar';
        const m=opts.meta;
        // build: routing badge, compression, tokens, resilience dot
        const route = m.routing?.chosen || m.routing?.task || chatModelSel.value || 'auto';
        const strat = m.routing?.explanation ? '' : '';
        const tok = m.usage ? `${m.usage.total_tokens||m.usage.completion_tokens||'?'} tok` : '';
        const mem = m.memory;
        let comp='';
        if(mem && mem.summarized){
          const pct = mem.originalTokens ? Math.round((mem.savedTokens/mem.originalTokens)*100) : 27;
          comp = `Compressed ${mem.originalTokens} → ${mem.finalTokens} tokens (${pct}%)`;
        } else if(mem){
          comp = `${mem.finalTokens||'?'} tok · ${mem.pipeline||'RTK'}`;
        }
        const provider = m.provider || 'Bridge Engine';
        const dotClass = m.resilienceHealthy === false ? 'dot--warn' : 'dot--on';
        meta.innerHTML = `<span style="font-weight:700">${esc(route)}</span> <span>•</span> <span>${esc(provider)}</span> <span>•</span> <span>16-factor</span> ${tok?`<span>•</span> <span>${tok}</span>`:''} ${comp?`<span>•</span> <span>${comp}</span>`:''} <span class="dot ${dotClass}" style="width:7px;height:7px"></span> <span>healthy</span>`;
        col.appendChild(meta);
      }
      // suggested chips below last assistant
      if(opts.isLast){
        const sug=document.createElement('div');
        sug.className='suggested-row';
        const chips=[
          {label:'Explain more', prompt:'Explain more in detail'},
          {label:'Give code', prompt:'Give me code for this'},
          {label:'🇮🇳 Tamil', prompt:'Translate to Tamil'},
          {label:'🇮🇳 Hindi', prompt:'Translate to Hindi'},
          {label:'🌐 Languages', prompt:'Show all translation languages'},
        ];
        for(const c of chips){
          const b=document.createElement('button'); b.className='suggested-chip'; b.textContent=c.label;
          b.addEventListener('click', ()=>{ chatInput.value=c.prompt; chatInput.focus(); chatInput.dispatchEvent(new Event('input')); });
          sug.appendChild(b);
        }
        col.appendChild(sug);
      }
    } else {
      const ts=document.createElement('div'); ts.className='ts'; ts.style.cssText='font-size:10px;color:var(--muted);text-align:right;margin-top:2px';
      ts.textContent=formatTime(opts.at||new Date());
      col.appendChild(ts);
    }

    if(role==='user'){
      row.appendChild(col);
      row.appendChild(avatar);
    } else {
      row.appendChild(avatar);
      row.appendChild(col);
    }
    return row;
  }

  function nearBottom(){ return chatStream && (chatStream.scrollHeight - chatStream.scrollTop - chatStream.clientHeight < 140); }
  function pinBottom(force=false){ if(!chatStream) return; if(force || nearBottom()) chatStream.scrollTop = chatStream.scrollHeight; }
  function renderStream(){
    if(!chatStream) return;
    const pinned = nearBottom();
    chatStream.innerHTML='';
    if(!messages.length){
      const welcome=document.createElement('div');
      welcome.className='bubble system';
      welcome.innerHTML='Welcome to <b>AI Bridge Agent</b> — Universal AI Chat. Pick a model above, type a message, or <b>Import chat from ChatGPT</b> to bridge any conversation. 🌉';
      chatStream.appendChild(welcome);
    } else {
      for(let i=0;i<messages.length;i++){
        const m=messages[i];
        const isLast = i===messages.length-1 && m.role==='assistant';
        const row=createMessageRow(m.role, m.content, {isLast, meta: m._meta || null, at: m._at ? new Date(m._at) : new Date()});
        chatStream.appendChild(row);
      }
    }
    if(pinned) pinBottom();
    updateTokenInfo();
  }
  function updateTokenInfo(){
    if(!tokenInfo) return;
    const toks=estMsgsTokens(messages);
    const model=idToModel(chatModelSel.value).name;
    tokenInfo.textContent=`${messages.length} messages · ~${toks.toLocaleString()} tokens · ${model}`;
  }
  function typingEl(){
    const d=document.createElement('div'); d.className='msg-row assistant';
    d.id='typing';
    d.innerHTML=`<div class="avatar assistant">⚡</div><div class="msg-col"><div class="typing"><span></span><span></span><span></span><span style="margin-left:6px;font-size:11px;color:var(--muted)">AI is thinking…</span></div></div>`;
    return d;
  }
  async function regenerateLast(){
    // find last user message and resend
    const lastUser = [...messages].reverse().find(m=>m.role==='user');
    if(!lastUser) return;
    // remove last assistant if exists
    if(messages.length && messages[messages.length-1].role==='assistant') messages.pop();
    renderStream();
    await doFetchAndStream(lastUser.content, true);
  }
  async function doFetchAndStream(userText, isRegen=false){
    if(!isRegen){
      // already pushed user message before calling
    }
    const t=typingEl(); chatStream.appendChild(t); pinBottom(true);
    sendBtn.disabled=true; chatInput.disabled=true;
    const model=chatModelSel.value||'auto';
    // live status in the model header while generating (restored in finally)
    const topName=document.getElementById('chatModelName');
    if(topName) topName.textContent=`⚡ Thinking… routing via ${model}`;
    if(chatModelInfo) chatModelInfo.dataset.busy='1';
    // INVISIBLE AUTO-SWITCH: user never sees limits/errors — silently rotate models until one answers
    const chain=[...new Set([model,'auto','auto/coding','auto/fast','fusion'])];
    let r=null, j=null, usedModel=model, lastErr=null;
    for(const m of chain){
      try{
        // invisible summary-transfer: huge histories move as a compact brief (token control)
        const bigHist = messages.reduce((a,mm)=>a+String(mm.content||'').length,0) > 32000;
        r=await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messages, model:m, temperature:0.7, max_tokens:2048, summary: bigHist || undefined }) });
        j=await r.json();
        if(j && (j.content || j.choices)) { usedModel=m; lastErr=null; break; }
        lastErr=new Error(j?.error||`empty response from ${m}`);
      }catch(e){ lastErr=e; }
    }
    if(!j || (!j.content && !j.choices)){
      // all models unreachable (backend down) — show inline error, never leave buttons disabled
      t.remove();
      const d=document.createElement('div'); d.className='bubble system';
      d.textContent='Error: '+String((lastErr&&lastErr.message)||'all models unreachable')+' — check backend at :8787 /api/health';
      chatStream.appendChild(d);
      sendBtn.disabled=false; chatInput.disabled=false; chatInput.focus();
      pinBottom();
      return;
    }
    t.remove();
    try{
      const content=j.content || j.error || 'No response';
      const meta = { routing: j.routing, memory: j.memory, usage: j.usage, provider: j.provider||'ai-bridge', resilienceHealthy: true };
      lastMeta = meta;
      // streaming container with cursor
      const row=document.createElement('div'); row.className='msg-row assistant';
      const avatar=document.createElement('div'); avatar.className='avatar assistant'; avatar.textContent='⚡';
      const col=document.createElement('div'); col.className='msg-col';
      const bubble=document.createElement('div'); bubble.className='bubble assistant';
      const mdWrap=document.createElement('div'); mdWrap.className='md';
      bubble.appendChild(mdWrap);
      col.appendChild(bubble);
      row.appendChild(avatar); row.appendChild(col);
      chatStream.appendChild(row);
      pinBottom();
      // smooth char-by-char with 15ms per chunk + cursor ▌
      let idx=0;
      const cursor='<span class="cursor" style="opacity:.7">▌</span>';
      await new Promise(resolve=>{
        const iv=setInterval(()=>{
          idx=Math.min(idx+3, content.length);
          const slice=esc(content.slice(0, idx));
          mdWrap.innerHTML = slice.replace(/\n/g,'<br/>') + (idx<content.length?cursor:'');
          pinBottom();
          if(idx>=content.length){ clearInterval(iv); resolve(); }
        }, 15);
      });
      // final markdown render
      mdWrap.innerHTML = mdToHtml(content);
      // attach actions + meta + suggestions
      const actions=document.createElement('div'); actions.className='msg-actions';
      actions.innerHTML=`<button class="act-copy" title="Copy">⎘ Copy</button><button class="act-regen" title="Regenerate">↻ Regenerate</button><button class="act-like" title="Like">👍</button><button class="act-dislike" title="Dislike">👎</button><span class="ts">${formatTime(new Date())}</span>`;
      actions.querySelector('.act-copy').addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(content); const b=actions.querySelector('.act-copy'); b.textContent='✓ Copied'; setTimeout(()=>b.textContent='⎘ Copy',1200);}catch{} });
      actions.querySelector('.act-regen').addEventListener('click', regenerateLast);
      col.appendChild(actions);
      // meta bar
      const metaBar=document.createElement('div'); metaBar.className='meta-bar';
      const route = meta.routing?.chosen || model;
      const tok = meta.usage ? `${meta.usage.total_tokens||meta.usage.completion_tokens||'?'} tok` : '';
      let comp='';
      if(meta.memory && meta.memory.summarized){
        const pct = meta.memory.originalTokens ? Math.round((meta.memory.savedTokens/meta.memory.originalTokens)*100) : 27;
        comp = `Compressed ${meta.memory.originalTokens} → ${meta.memory.finalTokens} tokens (${pct}%)`;
      } else if(meta.memory){
        comp = `${meta.memory.finalTokens||'?'} tok · ${meta.memory.pipeline||'RTK'}`;
      }
      metaBar.innerHTML = `<span style="font-weight:700">${esc(route)}</span> <span>•</span> <span>${esc(meta.provider)}</span> <span>•</span> <span>16-factor</span> ${tok?`<span>•</span> <span>${tok}</span>`:''} ${comp?`<span>•</span> <span>${comp}</span>`:''} <span class="dot dot--on" style="width:7px;height:7px"></span> <span>healthy</span>`;
      col.appendChild(metaBar);
      // suggestions
      const sug=document.createElement('div'); sug.className='suggested-row';
      for(const c of [{label:'Explain more',prompt:'Explain more in detail'},{label:'Give code',prompt:'Give me code for this'},{label:'🇮🇳 Tamil',prompt:'Translate to Tamil'},{label:'🇮🇳 Hindi',prompt:'Translate to Hindi'},{label:'🌐 Languages',prompt:'Show all translation languages'}]){
        const b=document.createElement('button'); b.className='suggested-chip'; b.textContent=c.label;
        b.addEventListener('click', ()=>{ chatInput.value=c.prompt; chatInput.focus(); chatInput.dispatchEvent(new Event('input')); });
        sug.appendChild(b);
      }
      col.appendChild(sug);

      messages.push({role:'assistant', content, _meta: meta, _at: new Date().toISOString()});
      persistActive(); renderHist();
    }catch(e){
      t.remove();
      const d=document.createElement('div'); d.className='bubble system';
      d.textContent='Error: '+String(e.message)+' — check backend at :8787 /api/health';
      chatStream.appendChild(d);
    }finally{
      sendBtn.disabled=false; chatInput.disabled=false;
      try{ chatInput.focus({preventScroll:true}); }catch{ chatInput.focus(); }
      updateModelInfo();
      if(chatModelInfo) delete chatModelInfo.dataset.busy;
      pinBottom();
    }
  }
  async function sendMessage(){
    const text=chatInput.value.trim();
    if(!text) return;
    if(!activeId) newSession();
    const at=new Date().toISOString();
    messages.push({role:'user', content: text, _at: at});
    chatInput.value=''; chatInput.style.height='auto';
    typingDetails();
    renderStream(); persistActive();
    await doFetchAndStream(text, false);
  }
  sendBtn?.addEventListener('click', sendMessage);
  chatInput?.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  });
  // auto-resize + Shift+Enter support + LIVE typing details in sidebar
  function typingDetails(){
    const info=document.getElementById('typingDetails');
    const v=(chatInput?.value||'');
    if(!v.trim()){ if(info) info.style.display='none'; return; }
    const words=(v.trim().match(/\S+/g)||[]).length;
    const toks=Math.ceil(v.length/4);
    const lang=/[\u0B80-\u0BFF]/.test(v)?'Tamil':/[\u0900-\u097F]/.test(v)?'Hindi':/[\u0D80-\u0DFF]/.test(v)?'Sinhala':'English';
    const task=/(```|code|function|error|bug|html|python|react)/i.test(v)?'Code':/(translat)/i.test(v)?'Translate':/\?$/.test(v.trim())?'Question':'Chat';
    if(info){
      info.style.display='block';
      info.innerHTML=`<b>Typing…</b> ${words} words · ~${toks} tokens · ${lang} · ${task}<br/><span style="opacity:.75">${esc(v.slice(0,90))}${v.length>90?'…':''}</span>`;
    }
  }
  chatInput?.addEventListener('input', ()=>{
    chatInput.style.height='auto'; chatInput.style.height=Math.min(chatInput.scrollHeight, 120)+'px';
    typingDetails();
  });
  $('#newChatBtn')?.addEventListener('click', ()=> newSession());
  $('#clearHistBtn')?.addEventListener('click', ()=>{
    if(confirm('Clear all chat history?')){ sessions=[]; activeId=null; messages=[]; saveSessions(); renderHist(); renderStream(); }
  });
  $('#exportBtn')?.addEventListener('click', async ()=>{
    const data=JSON.stringify(messages,null,2);
    try{ await navigator.clipboard.writeText(data); alert('Copied conversation JSON to clipboard'); }catch{ prompt('Copy JSON:', data); }
  });
  // bridge modal
  function openBridge(){ if(bridgeModal){ bridgeModal.style.display='flex'; bridgeTextarea.focus(); } }
  function closeBridge(){ if(bridgeModal) bridgeModal.style.display='none'; }
  $('#bridgeImportBtn')?.addEventListener('click', openBridge);
  $('#closeBridgeModal')?.addEventListener('click', closeBridge);
  bridgeModal?.addEventListener('click', (e)=>{ if(e.target===bridgeModal) closeBridge(); });
  $('#bridgeExampleBtn')?.addEventListener('click', ()=>{
    bridgeTextarea.value=JSON.stringify(EXAMPLES.code,null,2);
  });
  $('#doBridgeImport')?.addEventListener('click', ()=>{
    const raw=bridgeTextarea.value.trim();
    if(!raw) return alert('Paste conversation first');
    let msgs=[];
    try{ const j=JSON.parse(raw); if(Array.isArray(j)) msgs=j.filter(m=>m&&typeof m.content==='string'); else if(j&&Array.isArray(j.messages)) msgs=j.messages.filter(m=>m&&typeof m.content==='string'); }catch{}
    if(!msgs.length && raw.length>4) msgs=[{role:'user', content: raw}];
    if(!msgs.length) return alert('Could not parse messages');
    closeBridge();
    newSession(msgs);
  });
  // prompt chips
  $$('.prompt-chip').forEach(ch=>{
    ch.addEventListener('click', ()=>{
      const p=ch.getAttribute('data-prompt')||ch.textContent;
      chatInput.value=p; chatInput.focus(); chatInput.dispatchEvent(new Event('input'));
    });
  });
  // attach button: pick a text/code file and paste its content into the input
  const attachBtn=$('#attachBtn');
  let fileInput=null;
  attachBtn?.addEventListener('click', ()=>{
    if(!fileInput){
      fileInput=document.createElement('input');
      fileInput.type='file';
      fileInput.accept='.txt,.md,.markdown,.json,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.csv,.log,.xml,.yml,.yaml,.sh,.sql,.env,.gitignore';
      fileInput.style.display='none';
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', ()=>{
        const f=fileInput.files?.[0];
        fileInput.value='';
        if(!f) return;
        if(f.size>500*1024){ alert('File too large (max 500KB).'); return; }
        const r=new FileReader();
        r.onload=()=>{
          const text=String(r.result||'');
          const ext=(f.name.split('.').pop()||'txt').toLowerCase();
          const block=`\n\n[Attached file: ${f.name}]\n\`\`\`${ext}\n${text.slice(0,12000)}\n\`\`\`\n`;
          chatInput.value=(chatInput.value?chatInput.value+'\n':'')+`Summarize / use this file:${block}`;
          chatInput.focus(); chatInput.dispatchEvent(new Event('input'));
        };
        r.onerror=()=>alert('Could not read file. Only text files are supported (images/PDF not yet).');
        r.readAsText(f);
      });
    }
    fileInput.click();
  });
  // mobile side toggle
  $('#toggleSideBtn')?.addEventListener('click', ()=> chatSide?.classList.toggle('open'));
  // if toggled hamburger on chat
  $('#hamburger2')?.addEventListener('click', ()=> chatSide?.classList.toggle('open'));
  // load bridge from localStorage (from index) or ?model
  const bridgeMsgs=localStorage.getItem('aibridge_bridge_msgs');
  if(bridgeMsgs){
    try{ const ms=JSON.parse(bridgeMsgs); if(Array.isArray(ms)&&ms.length){ newSession(ms); localStorage.removeItem('aibridge_bridge_msgs'); } }catch{}
  } else if(sessions.length){ loadSession(activeId||sessions[0].id); }
  renderHist(); if(!messages.length) renderStream();
  // health
  async function refreshHealth2(){
    try{
      const r=await fetch('/api/health'); const j=await r.json();
      if(j.bridge_ok){ healthDot2.className='dot dot--on'; healthText2.textContent=`Bridge Engine OK · ${j.models??'?'} models`; }
      else { healthDot2.className='dot dot--on'; healthText2.textContent=`⚡ AI Bridge • auto ready`; }
    }catch{
      healthDot2.className='dot dot--off'; healthText2.textContent='Offline';
    }
  }
  refreshHealth2(); setInterval(refreshHealth2, 9000);
  // expose for detail bridging
  window._chatNewSession=newSession;
}

// ---------- MODELS PAGE ----------
if(isModels){
  const modelSearch=$('#modelSearch');
  const providerFilter=$('#providerFilter');
  const tagFilter=$('#tagFilter');
  const sortSel=$('#sortSel');
  const modelsGrid=$('#modelsGrid');
  const modelCount=$('#modelCount');
  const modelsEmpty=$('#modelsEmpty');
  const modelsHealth=$('#modelsHealth');

  // provider filter options
  const provs=[...new Set(CATALOG.map(m=>m.provider))].sort();
  if(providerFilter){
    for(const p of provs){ const o=document.createElement('option'); o.value=p; o.textContent=p; providerFilter.appendChild(o); }
  }
  // init from ?q
  const q0=getQ('q'); if(q0 && modelSearch) modelSearch.value=q0;
  const q1=getQ('provider'); if(q1 && providerFilter) providerFilter.value=q1;

  function renderModels(){
    const q=(modelSearch?.value||'').toLowerCase().trim();
    const prov=providerFilter?.value||'';
    const tag=tagFilter?.value||'';
    const sort=sortSel?.value||'featured';
    let list=[...CATALOG];
    if(q) list=list.filter(m=>[m.name,m.provider,m.desc,m.id,m.tags.join(' ')].join(' ').toLowerCase().includes(q));
    if(prov) list=list.filter(m=>m.provider===prov);
    if(tag) list=list.filter(m=>m.tags.includes(tag));
    if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
    else if(sort==='provider') list.sort((a,b)=>a.provider.localeCompare(b.provider));
    if(modelsGrid){
      if(list.length){
        modelsGrid.innerHTML=list.map(cardHTML).join('');
        if(modelsEmpty) modelsEmpty.style.display='none';
      } else {
        // smart empty state: never leave the page dead — show popular models + one-click suggestions
        const popular=[...CATALOG].sort((a,b)=>b.rating-a.rating).slice(0,6);
        modelsGrid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:8px 0 4px"><b>No exact match for "${esc(q)}"</b><br/><span class="hint">Try one of these, or click a suggestion:</span><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px">${['gpt','claude','code','free','gemini'].map(s=>`<button class="prompt-chip" data-sug="${s}">${s}</button>`).join('')}</div><div class="hint" style="margin-top:10px">Popular right now:</div></div>`+popular.map(cardHTML).join('');
        modelsGrid.querySelectorAll('[data-sug]').forEach(b=>b.addEventListener('click',()=>{ if(modelSearch){ modelSearch.value=b.getAttribute('data-sug'); renderModels(); } }));
        if(modelsEmpty) modelsEmpty.style.display='none';
      }
    }
    if(modelCount) modelCount.textContent=list.length?`${list.length} models`:`0 matches — showing popular`;
  }
  modelSearch?.addEventListener('input', renderModels);
  providerFilter?.addEventListener('change', renderModels);
  tagFilter?.addEventListener('change', renderModels);
  sortSel?.addEventListener('change', renderModels);
  renderModels();
  // fetch live health to update
  fetch('/api/health').then(r=>r.json()).then(j=>{
    if(modelsHealth) modelsHealth.textContent=j.bridge_ok?`Live: ${j.models} models via Bridge Engine`:`Backend OK — showing curated ${CATALOG.length} (full 300+ via API)`;
  }).catch(()=>{ if(modelsHealth) modelsHealth.textContent=`Showing curated ${CATALOG.length} — full 300+ via /api/models`; });
}

// ---------- DETAIL PAGE ----------
if(isDetail){
  const id=getQ('id')||'openai/gpt-4o';
  const known=CATALOG.some(m=>m.id===id);
  const m=idToModel(id);
  const detailIcon=$('#detailIcon');
  const detailTitle=$('#detailTitle');
  const detailSub=$('#detailSub');
  const detailBadges=$('#detailBadges');
  const detailDesc=$('#detailDesc');
  const detailCaps=$('#detailCaps');
  const detailPrompts=$('#detailPrompts');
  const detailPricing=$('#detailPricing');
  const detailStats=$('#detailStats');
  const detailCurl=$('#detailCurl');

  if(detailIcon){ detailIcon.style.background=m.color; detailIcon.innerHTML=logoFor(m.provider, m.icon); }
  if(detailTitle) detailTitle.textContent=m.name;
  if(detailSub) detailSub.textContent = known
    ? `${m.provider} · ${m.id} · ${m.context} context · ★ ${m.rating}`
    : `Unknown model "${id}" — showing closest match (${m.id}) · ${m.provider} · ${m.context} context · ★ ${m.rating}`;
  if(detailBadges) detailBadges.innerHTML=`<span class="badge">${esc(m.provider)}</span><span class="badge">${esc(m.context)}</span><span class="badge">${esc(m.price)}</span>${m.tags.map(t=>`<span class="badge ${t==='free'?'free': t==='fast'?'fast': t==='coding'?'code':''}">${esc(t)}</span>`).join('')}`;
  if(detailDesc) detailDesc.textContent=m.desc + ` — Part of Bridge Engine's 300+-provider network. Use via unified OpenAI-compatible API at /v1/chat/completions with model "${m.id}". Auto-routing picks this model when best for your task.`;
  if(detailCaps) detailCaps.innerHTML=m.caps.map(c=>`<span class="badge">${esc(c)}</span>`).join('');
  if(detailPrompts){
    const prompts=[
      `Explain ${m.name} vs GPT-4o for coding tasks`,
      `Use ${m.name} to write a debounce utility in TypeScript`,
      `Summarize a 50-page PDF using ${m.name} long context`,
    ];
    detailPrompts.innerHTML=prompts.map(p=>`<div class="prompt-chip" style="cursor:pointer" data-p="${esc(p)}">💬 ${esc(p)}</div>`).join('');
    detailPrompts.querySelectorAll('[data-p]').forEach(el=> el.addEventListener('click', ()=>{ location.href='/chat?model='+encodeURIComponent(m.id); }));
  }
  if(detailPricing){
    detailPricing.innerHTML=`<tr><td>${esc(m.price)}</td><td>${m.tags.includes('free')?'Free':esc(m.price)}</td><td>${esc(m.context)}</td><td>via Bridge Engine</td></tr>`;
  }
  if(detailStats){
    detailStats.innerHTML=`
      <div style="display:flex;justify-content:space-between"><span class="hint">Provider</span><b>${esc(m.provider)}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="hint">Context</span><b>${esc(m.context)}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="hint">Rating</span><b>★ ${m.rating} / 5</b></div>
      <div style="display:flex;justify-content:space-between"><span class="hint">Price</span><b>${esc(m.price)}</b></div>
      <div style="display:flex;justify-content:space-between"><span class="hint">Model ID</span><code style="background:var(--card2);padding:2px 6px;border-radius:6px;font-size:11px">${esc(m.id)}</code></div>
    `;
  }
  const curlTxt=`curl http://localhost:8787/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${m.id}",
    "messages": [{"role":"user","content":"Hello!"}]
  }'

# Or via transfer API (with memory + routing):
curl http://localhost:8787/api/transfer \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello!"}],"model":"${m.id}"}'`;
  if(detailCurl) detailCurl.textContent=curlTxt;
  $('#copyCurlBtn')?.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(curlTxt); const b=$('#copyCurlBtn'); b.textContent='Copied!'; setTimeout(()=>b.textContent='Copy curl',1100);}catch{} });
  const startChatBtn=$('#startChatBtn');
  if(startChatBtn) startChatBtn.href='/chat?model='+encodeURIComponent(m.id);
  $('#bridgeHereBtn')?.addEventListener('click', ()=>{
    const inp=$('#detailBridgeInput');
    const raw=inp?.value.trim();
    if(!raw) { location.href='/chat?model='+encodeURIComponent(m.id); return; }
    let msgs=[];
    try{ const j=JSON.parse(raw); if(Array.isArray(j)) msgs=j.filter(m=>m&&typeof m.content==='string'); else if(j&&Array.isArray(j.messages)) msgs=j.messages.filter(m=>m&&typeof m.content==='string'); }catch{}
    if(!msgs.length && raw.length>4) msgs=[{role:'user', content: raw}];
    if(msgs.length){ try{ localStorage.setItem('aibridge_bridge_msgs', JSON.stringify(msgs)); }catch{} }
    location.href='/chat?model='+encodeURIComponent(m.id);
  });
  $('#detailBridgeBtn')?.addEventListener('click', ()=>{
    const raw=$('#detailBridgeInput')?.value.trim();
    if(raw){
      let msgs=[];
      try{ const j=JSON.parse(raw); if(Array.isArray(j)) msgs=j.filter(m=>m&&typeof m.content==='string'); else if(j&&Array.isArray(j.messages)) msgs=j.messages.filter(m=>m&&typeof m.content==='string'); }catch{}
      if(!msgs.length && raw.length>4) msgs=[{role:'user', content: raw}];
      if(msgs.length){ try{ localStorage.setItem('aibridge_bridge_msgs', JSON.stringify(msgs)); }catch{} }
    }
    location.href='/chat?model='+encodeURIComponent(m.id);
  });
}
