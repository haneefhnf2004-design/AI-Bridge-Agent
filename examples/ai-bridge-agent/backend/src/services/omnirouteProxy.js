/**
 * bridgeProxy.js — proxy to Bridge Engine with circuit breaker + retry
 * Intelligent mock fallback: gives REAL useful answers in user's language, no offline error.
 * Natural ChatGPT-like personality — no template boilerplate.
 */
const BRIDGE_BASE = process.env.BRIDGE_BASE || 'http://localhost:20128/v1';
const TIMEOUT_MS = 12000;

// simple circuit breaker
let failures = 0;
let openUntil = 0;
const THRESHOLD = 3;
const COOLDOWN_MS = 15000;

function isOpen() { return Date.now() < openUntil; }
function recordSuccess() { failures = 0; openUntil = 0; }
function recordFailure() {
  failures++;
  if (failures >= THRESHOLD) openUntil = Date.now() + COOLDOWN_MS;
}

async function fetchWithTimeout(url, opts = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export async function healthCheckBridge() {
  if (isOpen()) return { ok: false, circuit: 'open', until: openUntil };
  try {
    const r = await fetchWithTimeout(`${BRIDGE_BASE}/models`, { method: 'GET' }, 4500);
    if (!r.ok) { recordFailure(); return { ok: false, status: r.status, circuit: failures >= THRESHOLD ? 'open' : 'closed' }; }
    const j = await r.json();
    recordSuccess();
    const count = Array.isArray(j.data) ? j.data.length : 0;
    return { ok: true, count, raw: j, base: BRIDGE_BASE, circuit: 'closed' };
  } catch (e) {
    recordFailure();
    return { ok: false, error: String(e?.message ?? e), base: BRIDGE_BASE, circuit: isOpen() ? 'open' : 'closed' };
  }
}

export async function listModelsProxy() {
  const h = await healthCheckBridge();
  if (h.ok && Array.isArray(h.raw?.data) && h.raw.data.length) {
    return h.raw.data.map(m => ({ id: m.id, name: m.id, provider: m.id.split('/')[0] }));
  }
  return null; // caller will use curated fallback
}

export async function proxyChatCompletions(messages, model = 'auto', opts = {}) {
  if (isOpen()) {
    return { ok: false, circuit: 'open', error: 'Circuit open — Bridge Engine temporarily unavailable', fallback: true };
  }
  const body = JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.max_tokens ?? 2048,
    stream: false,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchWithTimeout(`${BRIDGE_BASE}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }, TIMEOUT_MS);
      if (r.ok) {
        const j = await r.json();
        recordSuccess();
        const content = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? '';
        return { ok: true, content, model: j.model ?? model, provider: j.provider ?? 'bridge', usage: j.usage ?? null, raw: j };
      }
      const text = await r.text().catch(() => '');
      // 4xx -> don't retry
      if (r.status >= 400 && r.status < 500) {
        recordFailure();
        return { ok: false, status: r.status, error: text.slice(0, 600), fallback: true };
      }
      // 5xx -> retry
      if (attempt < 2) { await new Promise(res => setTimeout(res, 350 * (attempt + 1))); continue; }
      recordFailure();
      return { ok: false, status: r.status, error: text.slice(0, 600), fallback: true };
    } catch (e) {
      if (attempt < 2) { await new Promise(res => setTimeout(res, 350 * (attempt + 1))); continue; }
      recordFailure();
      return { ok: false, error: String(e?.message ?? e), fallback: true };
    }
  }
  return { ok: false, error: 'Unknown proxy error', fallback: true };
}

export function mockCompletion(messages, model) {
  const last = messages[messages.length - 1]?.content ?? '';
  const lower = last.toLowerCase().trim();

  // --- language detection ---
  const tamilChar = /[\u0B80-\u0BFF]/.test(last);
  const hindiChar = /[\u0900-\u097F]/.test(last);
  const tamilRoman = /(vanakkam|nandri|nanri|\benna\b|eppadi|epdi|panna|panra|pannalama|pannalam|iyaluma|mudiyum|mudiyuma|seyyala|seiyalam|yanakku|yenakku|enakku|unakku|ungal|konjam|kudunga|seiyunga|theriyuma|puriyala|puriyutha|venum|vendum|edhavadhu|ethavathu|illana|pannitha|udane|sollunga|\bsollu\b|\bkudu\b|\bpannu\b|\bpaaru\b|eppudu|help pann|ithula|appade|unmai|kandippa|\billa\b|oru help)/i.test(last);
  const isTamil = tamilChar || tamilRoman;
  const isHindi = hindiChar || /(namaste|kaise|hindi|dhanyavaad|batao|samjhao|kijiye|\bkya\b|\bhai\b|\baap\b|\bkaro\b)/i.test(lower);

  const wantsTranslation = /(translat|\u0BAE\u0BCA\u0BB4\u0BBF\u0BAA\u0BC6\u0BAF\u0BB0\u0BCD|anuvaad|convert.*(to|into))/i.test(lower);
  const wantsCalculator = /(calculator|calulater|calu|calc|\u0B95\u0BBE\u0BB2\u0BCD\u0B95\u0BC1\u0BB2\u0BC7\u0B9F\u0BCD\u0B9F\u0BB0\u0BCD)/i.test(lower);
  const wantsCode = /(code|coding|program|html|css|js|javascript|react|useeffect|python|function|api|bug|error|fix)/i.test(lower);
  const wantsPurpose = /(project purpose|purpose of|purpose enna|tool.*purpose|purpose.*tool|what is ai bridge|ai bridge.*purpose|enna project|ethukku|ithu enna|ithu.*enna|ethu.*enna|enna use|what.*(tool|this|app)|this.*(tool|app).*(what|purpose)|ominirute|omniroute|\bpurpose\b)/i.test(lower);
  const wantsIdeas = /(idea|ideas|suggest|list|bullets|points)/i.test(lower);
  const isGreetingShort = /^(hello|hi|hey|vanakkam|hii|hello!|hi!|hey!|vanakkam!|yo|sup)$/i.test(lower) || (lower.length < 10 && /^(hello|hi|vanakkam)/i.test(lower));
  const isTamilHelpExact = /(yanakku|enakku|unakku|yenakku).*help.*(panna|iyaluma|mudiyuma|seyyuma)/i.test(lower) || lower.includes('yanakku oru help panna iyaluma');

  // --- language table: 16 translation options ---
  const LANGS = {
    tamil:      { label: 'Tamil',      flag: '🇮🇳', hello: 'Vanakkam (\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD)', how: 'Neenga eppadi irukkeenga? (\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B8E\u0BAA\u0BCD\u0BAA\u0B9F\u0BBF \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BB1\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD?)', thanks: 'Nandri (\u0BA8\u0BA9\u0BCD\u0BB1\u0BBF)', morning: 'Kaalai Vanakkam (\u0B95\u0BBE\u0BB2\u0BC8 \u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD)' },
    hindi:      { label: 'Hindi',      flag: '🇮🇳', hello: 'Namaste (\u0928\u092E\u0938\u094D\u0924\u0947)', how: 'Aap kaise hain? (\u0906\u092A \u0915\u0948\u0938\u0947 \u0939\u0948\u0902?)', thanks: 'Dhanyavaad (\u0927\u0928\u094D\u092F\u0935\u093E\u0926)', morning: 'Suprabhat (\u0938\u0941\u092A\u094D\u0930\u092D\u093E\u0924)' },
    english:    { label: 'English',    flag: '🇬🇧', hello: 'Hello', how: 'How are you?', thanks: 'Thank you', morning: 'Good morning' },
    malayalam:  { label: 'Malayalam',  flag: '🇮🇳', hello: 'Namaskaram (\u0D28\u0D2E\u0D38\u0D4D\u0D15\u0D3E\u0D30\u0D02)', how: 'Sukhamano? (\u0D38\u0D41\u0D16\u0D2E\u0D3E\u0D23\u0D4B?)', thanks: 'Nanni (\u0D28\u0D28\u0D4D\u0D26\u0D3F)', morning: 'Suprabhatham (\u0D38\u0D41\u0D2A\u0D4D\u0D30\u0D2D\u0D3E\u0D24\u0D02)' },
    telugu:     { label: 'Telugu',     flag: '🇮🇳', hello: 'Namaskaram (\u0C28\u0CAE\u0CB8\u0CCD\u0C15\u0CBE\u0CB0\u0C02)', how: 'Ela unnaru? (\u0C0E\u0C32\u0C3E \u0C09\u0C28\u0CCD\u0C28\u0C3E\u0C30\u0C41?)', thanks: 'Dhanyavadalu (\u0C27\u0CA8\u0CCD\u0CAF\u0CB5\u0CBE\u0C26\u0C3E\u0CB2\u0C41)', morning: 'Shubhodayam (\u0C36\u0CC1\u0CAD\u0CCB\u0CA6\u0CAF\u0C02)' },
    kannada:    { label: 'Kannada',    flag: '🇮🇳', hello: 'Namaskara (\u0CA8\u0CAE\u0CB8\u0CCD\u0C95\u0CBE\u0CB0)', how: 'Hegiddira? (\u0CB9\u0CC7\u0C97\u0CBF\u0CA6\u0CCD\u0C5F\u0C40\u0CB0\u0CBE?)', thanks: 'Dhanyavada (\u0CA7\u0CA8\u0CCD\u0CAF\u0CB5\u0CBE\u0CA6)', morning: 'Shubhodaya (\u0CB6\u0CC1\u0CAD\u0CCB\u0CC6\u0CA6\u0CAF)' },
    urdu:       { label: 'Urdu',       flag: '🇵🇰', hello: 'Assalam-o-Alaikum (\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u06CC\u06A9\u0645)', how: 'Aap kaise hain? (\u0622\u067E \u06A9\u06CC\u0633\u06D2 \u06C1\u06CC\u06BA\u061F)', thanks: 'Shukriya (\u0634\u06A9\u0631\u06CC\u06C1)', morning: 'Subah bakhair (\u0635\u0628\u062D \u0628\u062E\u06CC\u0631)' },
    arabic:     { label: 'Arabic',     flag: '🇸🇦', hello: 'Marhaba (\u0645\u0631\u062D\u0628\u0627)', how: 'Kaifa haluk? (\u0643\u064A\u0641 \u062D\u0627\u0644\u0643\u061F)', thanks: 'Shukran (\u0634\u0643\u0631\u0627\u064B)', morning: 'Sabah al-khair (\u0635\u0628\u0627\u062D \u0627\u0644\u062E\u064A\u0631)' },
    spanish:    { label: 'Spanish',    flag: '🇪🇸', hello: 'Hola', how: '\u00BFC\u00F3mo est\u00E1s?', thanks: 'Gracias', morning: 'Buenos d\u00EDas' },
    french:     { label: 'French',     flag: '🇫🇷', hello: 'Bonjour', how: 'Comment \u00E7a va ?', thanks: 'Merci', morning: 'Bonjour' },
    german:     { label: 'German',     flag: '🇩🇪', hello: 'Hallo', how: 'Wie geht es dir?', thanks: 'Danke', morning: 'Guten Morgen' },
    portuguese: { label: 'Portuguese', flag: '🇵🇹', hello: 'Ol\u00E1', how: 'Como vai voc\u00EA?', thanks: 'Obrigado', morning: 'Bom dia' },
    russian:    { label: 'Russian',    flag: '🇷🇺', hello: 'Privet (\u041F\u0440\u0438\u0432\u0435\u0442)', how: 'Kak dela? (\u041A\u0430\u043A \u0434\u0435\u043B\u0430?)', thanks: 'Spasibo (\u0421\u043F\u0430\u0441\u0438\u0431\u043E)', morning: 'Dobroye utro (\u0414\u043E\u0431\u0440\u043E\u0435 \u0443\u0442\u0440\u043E)' },
    chinese:    { label: 'Chinese',    flag: '🇨🇳', hello: 'N\u01D0 h\u01CEo (\u4F60\u597D)', how: 'N\u01D0 h\u01CEo ma? (\u4F60\u597D\u5417\uFF1F)', thanks: 'Xi\u00E8xie (\u8C22\u8C22)', morning: 'Z\u01CEo \u0101n (\u65E9\u5B89)' },
    japanese:   { label: 'Japanese',   flag: '🇯🇵', hello: 'Konnichiwa (\u3053\u3093\u306B\u3061\u306F)', how: 'Ogenki desu ka? (\u304A\u5143\u6C17\u3067\u3059\u304B\uFF1F)', thanks: 'Arigatou (\u3042\u308A\u304C\u3068\u3046)', morning: 'Ohayou (\u304A\u306F\u3088\u3046)' },
    korean:     { label: 'Korean',     flag: '🇰🇷', hello: 'Annyeonghaseyo (\uC548\uB155\uD558\uC138\uC694)', how: 'Jal jinaeseyo? (\uC798 \uC9C0\uB0B4\uC138\uC694?)', thanks: 'Gamsahamnida (\uAC10\uC0AC\uD569\uB2C8\uB2E4)', morning: 'Joeun achim (\uC88B\uC740 \uC544\uCE68)' },
    sinhala:    { label: 'Sinhala',    flag: '🇱🇰', hello: 'Ayubowan (ආයුබෝවන්)', how: 'Oya kohomada? (ඔයා කොහොමද?)', thanks: 'Bohoma sthuthi (බොහොම ස්තූතියි)', morning: 'Suba udasanak (සුබ උදෑසනක්)' },
    nepali:     { label: 'Nepali',     flag: '🇳🇵', hello: 'Namaste (\u0928\u092E\u0938\u094D\u0924\u0947)', how: 'Tapai kasto hunuhunchha? (\u0924\u092A\u093E\u0908 \u0915\u0938\u094D\u0924\u094B \u0939\u0941\u0928\u0941\u0939\u0941\u0928\u094D\u091B?)', thanks: 'Dhanyabad (\u0927\u0928\u094D\u092F\u0935\u093E\u0926)', morning: 'Subha prabhat (\u0936\u0941\u092D \u092A\u094D\u0930\u092D\u093E\u0924)' },
    bengali:    { label: 'Bengali',    flag: '🇧🇩', hello: 'Nomoshkar (\u09A8\u09AE\u09B8\u09CD\u0995\u09BE\u09B0)', how: 'Apni kemon achen? (\u0986\u09AA\u09A8\u09BF \u0995\u09C7\u09AE\u09A8 \u0986\u099B\u09C7\u09A8?)', thanks: 'Dhonnobad (\u09A7\u09A8\u09CD\u09AF\u09AC\u09BE\u09A6)', morning: 'Shuprobhat (\u09B8\u09C1\u09AA\u09CD\u09B0\u09AD\u09BE\u09A4)' },
    punjabi:    { label: 'Punjabi',    flag: '🇮🇳', hello: 'Sat Sri Akal (\u0A38\u0A24\u0A3F \u0A38\u0A4D\u0A30\u0A40 \u0A05\u0A15\u0A3E\u0A32)', how: 'Tusi kivein ho? (\u0A24\u0A41\u0A38\u0A40\u0A02 \u0A15\u0A3F\u0A35\u0A47 \u0A39\u0A4B?)', thanks: 'Shukriya (\u0A38\u0A3C\u0A41\u0A15\u0A30\u0A40\u0A06)', morning: 'Shubh savera (\u0A38\u0A3C\u0A41\u0A2D \u0A38\u0A35\u0A47\u0A30\u0A3E)' },
    gujarati:   { label: 'Gujarati',   flag: '🇮🇳', hello: 'Namaste (નમસ્તે)', how: 'Tamne kem cho? (તમને કેમ છો?)', thanks: 'Aabhar (આભાર)', morning: 'Shubh savar (શુભ સવાર)' },
    marathi:    { label: 'Marathi',    flag: '🇮🇳', hello: 'Namaskar (\u0928\u092E\u0938\u094D\u0915\u093E\u0930)', how: 'Tumhi kase aahat? (\u0924\u0941\u092E\u094D\u0939\u0940 \u0915\u0938\u0947 \u0906\u0939\u093E\u0924?)', thanks: 'Dhanyavad (\u0927\u0928\u094D\u092F\u0935\u093E\u0926)', morning: 'Shubh sakal (\u0936\u0941\u092D \u0938\u0915\u093E\u0933)' },
    turkish:    { label: 'Turkish',    flag: '🇹🇷', hello: 'Merhaba', how: 'Nas\u0131ls\u0131n?', thanks: 'Te\u015Fekk\u00FCrler', morning: 'G\u00FCnayd\u0131n' },
    italian:    { label: 'Italian',    flag: '🇮🇹', hello: 'Ciao', how: 'Come stai?', thanks: 'Grazie', morning: 'Buongiorno' },
    dutch:      { label: 'Dutch',      flag: '🇳🇱', hello: 'Hallo', how: 'Hoe gaat het?', thanks: 'Dank je', morning: 'Goedemorgen' },
    polish:     { label: 'Polish',     flag: '🇵🇱', hello: 'Cze\u015B\u0107', how: 'Jak si\u0119 masz?', thanks: 'Dzi\u0119kuj\u0119', morning: 'Dzie\u0144 dobry' },
    indonesian: { label: 'Indonesian', flag: '🇮🇩', hello: 'Halo', how: 'Apa kabar?', thanks: 'Terima kasih', morning: 'Selamat pagi' },
    malay:      { label: 'Malay',      flag: '🇲🇾', hello: 'Helo', how: 'Apa khabar?', thanks: 'Terima kasih', morning: 'Selamat pagi' },
    vietnamese: { label: 'Vietnamese', flag: '🇻🇳', hello: 'Xin ch\u00E0o', how: 'B\u1EA1n c\u00F3 kh\u1ECFe kh\u00F4ng?', thanks: 'C\u1EA3m \u01A1n', morning: 'Ch\u00E0o bu\u1ED5i s\u00E1ng' },
    thai:       { label: 'Thai',       flag: '🇹🇭', hello: 'Sawasdee (\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35)', how: 'Sabai dee mai? (\u0E2A\u0E1A\u0E32\u0E22\u0E14\u0E35\u0E44\u0E2B\u0E21?)', thanks: 'Khop khun (\u0E02\u0E2D\u0E1A\u0E04\u0E38\u0E13)', morning: 'Arun sawat (\u0E2D\u0E23\u0E38\u0E13\u0E2A\u0E27\u0E31\u0E2A\u0E14)' },
    swahili:    { label: 'Swahili',    flag: '🇰🇪', hello: 'Jambo', how: 'Habari yako?', thanks: 'Asante', morning: 'Habari za asubuhi' },
    persian:    { label: 'Persian',    flag: '🇮🇷', hello: 'Salam (\u0633\u0644\u0627\u0645)', how: 'Chetori? (\u0686\u0637\u0648\u0631\u06CC\u061F)', thanks: 'Mamnoon (\u0645\u0645\u0646\u0648\u0646)', morning: 'Sobh bekheir (\u0635\u0628\u062D \u0628\u062E\u06CC\u0631)' },
    greek:      { label: 'Greek',      flag: '🇬🇷', hello: 'Yia sou (Γεια σου)', how: 'Ti kaneis? (Τι κάνεις;)', thanks: 'Efharisto (Ευχαριστώ)', morning: 'Kalimera (Καλημέρα)' },
    romanian:   { label: 'Romanian',   flag: '🇷🇴', hello: 'Bună', how: 'Ce mai faci?', thanks: 'Mulțumesc', morning: 'Bună dimineața' },
    hungarian:  { label: 'Hungarian',  flag: '🇭🇺', hello: 'Szia', how: 'Hogy vagy?', thanks: 'Köszönöm', morning: 'Jó reggelt' },
    czech:      { label: 'Czech',      flag: '🇨🇿', hello: 'Ahoj', how: 'Jak se máš?', thanks: 'Děkuji', morning: 'Dobré ráno' },
    slovak:     { label: 'Slovak',     flag: '🇸🇰', hello: 'Ahoj', how: 'Ako sa máš?', thanks: 'Ďakujem', morning: 'Dobré ráno' },
    bulgarian:  { label: 'Bulgarian',  flag: '🇧🇬', hello: 'Zdravei (Здравей)', how: 'Kak si? (Как си?)', thanks: 'Blagodarya (Благодаря)', morning: 'Dobro utro (Добро утро)' },
    serbian:    { label: 'Serbian',    flag: '🇷🇸', hello: 'Zdravo (Здраво)', how: 'Kako si? (Како си?)', thanks: 'Hvala (Хвала)', morning: 'Dobro jutro (Добро јутро)' },
    croatian:   { label: 'Croatian',   flag: '🇭🇷', hello: 'Bok', how: 'Kako si?', thanks: 'Hvala', morning: 'Dobro jutro' },
    ukrainian:  { label: 'Ukrainian',  flag: '🇺🇦', hello: 'Pryvit (Привіт)', how: 'Yak spravy? (Як справи?)', thanks: 'Diakuiu (Дякую)', morning: 'Dobroho ranku (Доброго ранку)' },
    belarusian: { label: 'Belarusian', flag: '🇧🇾', hello: 'Pryvitannie (Прывітанне)', how: 'Yak spravy? (Як справы?)', thanks: 'Dziakui (Дзякуй)', morning: 'Dobraj ranicy (Добрай раніцы)' },
    danish:     { label: 'Danish',     flag: '🇩🇰', hello: 'Hej', how: 'Hvordan går det?', thanks: 'Tak', morning: 'Godmorgen' },
    swedish:    { label: 'Swedish',    flag: '🇸🇪', hello: 'Hej', how: 'Hur mår du?', thanks: 'Tack', morning: 'God morgon' },
    norwegian:  { label: 'Norwegian',  flag: '🇳🇴', hello: 'Hei', how: 'Hvordan har du det?', thanks: 'Takk', morning: 'God morgen' },
    finnish:    { label: 'Finnish',    flag: '🇫🇮', hello: 'Hei', how: 'Mitä kuuluu?', thanks: 'Kiitos', morning: 'Hyvää huomenta' },
    icelandic:  { label: 'Icelandic',  flag: '🇮🇸', hello: 'Halló', how: 'Hvað segirðu?', thanks: 'Takk', morning: 'Góðan daginn' },
    irish:      { label: 'Irish',      flag: '🇮🇪', hello: 'Dia duit', how: 'Conas atá tú?', thanks: 'Go raibh maith agat', morning: 'Maidin mhaith' },
    welsh:      { label: 'Welsh',      flag: '🏴󐁧󐁢󐁷󐁬󐁳󐁿', hello: 'Helo', how: 'Sut wyt ti?', thanks: 'Diolch', morning: 'Bore da' },
    catalan:    { label: 'Catalan',    flag: '🇪🇸', hello: 'Hola', how: 'Com estàs?', thanks: 'Gràcies', morning: 'Bon dia' },
    basque:     { label: 'Basque',     flag: '🇪🇸', hello: 'Kaixo', how: 'Zer moduz?', thanks: 'Eskerrik asko', morning: 'Egun on' },
    galician:   { label: 'Galician',   flag: '🇪🇸', hello: 'Ola', how: 'Como estás?', thanks: 'Grazas', morning: 'Bos días' },
    albanian:   { label: 'Albanian',   flag: '🇦🇱', hello: 'Përshëndetje', how: 'Si jeni?', thanks: 'Faleminderit', morning: 'Mirëmëngjes' },
    macedonian: { label: 'Macedonian', flag: '🇲🇰', hello: 'Zdravo (Здраво)', how: 'Kako si? (Како си?)', thanks: 'Blagodaram (Благодарам)', morning: 'Dobro utro (Добро утро)' },
    slovenian:  { label: 'Slovenian',  flag: '🇸🇮', hello: 'Živjo', how: 'Kako si?', thanks: 'Hvala', morning: 'Dobro jutro' },
    maltese:    { label: 'Maltese',    flag: '🇲🇹', hello: 'Bongu', how: 'Kif int?', thanks: 'Grazzi', morning: "L-għodwa t-tajba" },
    estonian:   { label: 'Estonian',   flag: '🇪🇪', hello: 'Tere', how: 'Kuidas läheb?', thanks: 'Aitäh', morning: 'Tere hommikust' },
    latvian:    { label: 'Latvian',    flag: '🇱🇻', hello: 'Sveiki', how: 'Kā tev iet?', thanks: 'Paldies', morning: 'Labrīt' },
    lithuanian: { label: 'Lithuanian', flag: '🇱🇹', hello: 'Labas', how: 'Kaip sekasi?', thanks: 'Ačiū', morning: 'Labas rytas' },
    georgian:   { label: 'Georgian',   flag: '🇬🇪', hello: 'Gamarjoba (გამარჯობა)', how: 'Rogor khar? (როგორ ხარ?)', thanks: 'Madloba (მადლობა)', morning: 'Dila mshvidobisa (დილა მშვიდობისა)' },
    armenian:   { label: 'Armenian',   flag: '🇦🇲', hello: 'Barev (Բարև)', how: 'Inchpes es? (Ինչպե՞ս ես?)', thanks: 'Shnorhakalutyun (Շնորհակալություն)', morning: 'Bari louys (Բարի լույս)' },
    azerbaijani:{ label: 'Azerbaijani',flag: '🇦🇿', hello: 'Salam', how: 'Necəsən?', thanks: 'Təşəkkürlər', morning: 'Sabahınız xeyir' },
    kazakh:     { label: 'Kazakh',     flag: '🇰🇿', hello: 'Salem (Сәлем)', how: 'Qalaysyz? (Қалайсыз?)', thanks: 'Rakhmet (Рахмет)', morning: 'Qayyrly tan (Қайырлы таң)' },
    uzbek:      { label: 'Uzbek',      flag: '🇺🇿', hello: 'Salom', how: 'Qandaysiz?', thanks: 'Rahmat', morning: 'Xayrli tong' },
    kyrgyz:     { label: 'Kyrgyz',     flag: '🇰🇬', hello: 'Salam (Салам)', how: 'Kandaysyz? (Кандайсыз?)', thanks: 'Rakhmat (Рахмат)', morning: 'Kutman tang (Кутман таң)' },
    tajik:      { label: 'Tajik',      flag: '🇹🇯', hello: 'Salom (Салом)', how: 'Shumo chi khelid? (Шумо чи хелед?)', thanks: 'Rakhmat (Раҳмат)', morning: 'Subh ba khair (Субҳ ба хайр)' },
    hebrew:     { label: 'Hebrew',     flag: '🇮🇱', hello: 'Shalom (שלום)', how: 'Ma nishma? (מה נשמע?)', thanks: 'Toda (תודה)', morning: 'Boker tov (בוקר טוב)' },
    kurdish:    { label: 'Kurdish',    flag: '🇮🇶', hello: 'Silav', how: 'Tu çawa yî?', thanks: 'Spas', morning: 'Beyanî baş' },
    pashto:     { label: 'Pashto',     flag: '🇦🇫', hello: 'Salam (سلام)', how: 'Tsenga yee? (څنګه يې؟)', thanks: 'Manana (مننه)', morning: 'Sahar pakhair (سهار پخير)' },
    sindhi:     { label: 'Sindhi',     flag: '🇵🇰', hello: 'Assalam-o-Alaikum (السلام عليڪم)', how: 'Cha haal aahin? (ڇا حال آهين؟)', thanks: 'Meherbani (مهرباني)', morning: 'Subah bakhair (صبح بخير)' },
    uyghur:     { label: 'Uyghur',     flag: '🇨🇳', hello: 'Essalam (ئەسالام)', how: 'Yakhshimu siz? (ياخشىمۇ سىز؟)', thanks: 'Raxmat (رەخمەت)', morning: 'Xeyrlik sabah (خەيرلىك ساباھ)' },
    odia:       { label: 'Odia',       flag: '🇮🇳', hello: 'Namaskar (ନମସ୍କାର)', how: 'Kemiti achha? (କେମିତି ଅଛ?)', thanks: 'Dhanyabad (ଧନ୍ୟବାଦ)', morning: 'Suprabhat (ସୁପ୍ରଭାତ)' },
    assamese:   { label: 'Assamese',   flag: '🇮🇳', hello: 'Nomoskar (নমস্কাৰ)', how: 'Apuni kene ase? (আপুনি কেনে আছে?)', thanks: 'Dhonyobad (ধন্যবাদ)', morning: 'Suprobhat (সুপ্ৰভাত)' },
    maithili:   { label: 'Maithili',   flag: '🇮🇳', hello: 'Pranam (प्रणाम)', how: 'Ahan kehan chhi? (अहाँ केहन छी?)', thanks: 'Dhanyabad (धन्यवाद)', morning: 'Suprabhat (सुप्रभात)' },
    konkani:    { label: 'Konkani',    flag: '🇮🇳', hello: 'Namaskar (नमस्कार)', how: 'Tum kashe aas? (तुम कशे आस?)', thanks: 'Devu borem korum (देवू बोरें कोरूं)', morning: 'Deu borem dis dium (देवू बोरें दीस दिउं)' },
    kashmiri:   { label: 'Kashmiri',   flag: '🇮🇳', hello: 'Salaam (سلام)', how: 'Kya haal chhu? (کیا حال چھو؟)', thanks: 'Shukriya (شکریہ)', morning: 'Subah bakhair (صبح بخیر)' },
    sanskrit:   { label: 'Sanskrit',   flag: '🇮🇳', hello: 'Namaste (नमस्ते)', how: 'Katham asti? (कथम् अस्ति?)', thanks: 'Dhanyavadah (धन्यवादः)', morning: 'Suprabhatam (सुप्रभातम्)' },
    dhivehi:    { label: 'Dhivehi',    flag: '🇲🇻', hello: 'Assalaam alaikum (އައްސަލާމް އަލައިކުމް)', how: 'Haalu kihineh? (ހާލު ކިހިނެހް?)', thanks: 'Shukriyaa (ޝުކުރިއްޔާ)', morning: 'Hendhuneh heyo (ހެނދުނේ ހެޔޮ)' },
    khmer:      { label: 'Khmer',      flag: '🇰🇭', hello: 'Sousdei (សួស្តី)', how: 'Sok sabay te? (សុខសប្បាយទេ?)', thanks: 'Orkun (អរគុណ)', morning: 'Arun sousdei (អរុណសួស្តី)' },
    lao:        { label: 'Lao',        flag: '🇱🇦', hello: 'Sabaidee (ສະບາຍດີ)', how: 'Sabai dee baw? (ສະບາຍດີບໍ?)', thanks: 'Khop jai (ຂອບໃຈ)', morning: 'Sabaidee ton sao (ສະບາຍດີຕອນເຊົ້າ)' },
    burmese:    { label: 'Burmese',    flag: '🇲🇲', hello: 'Mingalaba (မင်္ဂလာပါ)', how: 'Ne kaung la? (နေကောင်းလား?)', thanks: 'Kyezu tin ba de (ကျေးဇူးတင်ပါတယ်)', morning: 'Mingala nanet khin ba (မင်္ဂလာ နံနက်ခင်းပါ)' },
    filipino:   { label: 'Filipino',   flag: '🇵🇭', hello: 'Kumusta', how: 'Kumusta ka?', thanks: 'Salamat', morning: 'Magandang umaga' },
    javanese:   { label: 'Javanese',   flag: '🇮🇩', hello: 'Halo', how: 'Piye kabare?', thanks: 'Matur nuwun', morning: 'Sugeng enjing' },
    mongolian:  { label: 'Mongolian',  flag: '🇲🇳', hello: 'Sain uu (Сайн уу)', how: 'Sonin yu bna? (Сонин юу байна?)', thanks: 'Bayarlalaa (Баярлалаа)', morning: 'Ogloonii mend (Өглөөний мэнд)' },
    tibetan:    { label: 'Tibetan',    flag: '🇨🇳', hello: 'Tashi delek (བཀྲ་ཤིས་བདེ་ལེགས)', how: 'Khyed rang ku zu? (ཁྱེད་རང་སྐུ་གཟུགས?)', thanks: 'Thukje che (ཐུགས་རྗེ་ཆེ)', morning: 'Shok delek (ཞོགས་བདེ་ལེགས)' },
    cantonese:  { label: 'Cantonese',  flag: '🇭🇰', hello: 'Neih hou (你好)', how: 'Neih hou ma? (你好嗎？)', thanks: 'Mh goi (唔該)', morning: 'Jou san (早晨)' },
    amharic:    { label: 'Amharic',    flag: '🇪🇹', hello: 'Selam (ሰላም)', how: 'Dehna neh? (ደህና ነህ?)', thanks: 'Ameseginalehu (አመሰግናለሁ)', morning: 'Dehna aderk (ደህና አደርክ)' },
    oromo:      { label: 'Oromo',      flag: '🇪🇹', hello: 'Akkam', how: 'Akkam jirta?', thanks: 'Galatoomaa', morning: 'Akkam bulte' },
    tigrinya:   { label: 'Tigrinya',   flag: '🇪🇷', hello: 'Selam (ሰላም)', how: 'Kemay halleka? (ከመይ ሃልለኻ?)', thanks: 'Yeqeniyeley (የቕንየለይ)', morning: 'Dehan aderka (ደሃን ኣደርኻ)' },
    somali:     { label: 'Somali',     flag: '🇸🇴', hello: 'Iska warran', how: 'Sidee tahay?', thanks: 'Mahadsanid', morning: 'Subax wanaagsan' },
    yoruba:     { label: 'Yoruba',     flag: '🇳🇬', hello: 'Bawo ni', how: 'Bawo ni o?', thanks: 'E se', morning: 'E kaaro' },
    igbo:       { label: 'Igbo',       flag: '🇳🇬', hello: 'Ndewo', how: 'Kedu ka ị mere?', thanks: 'Daalu', morning: 'Ụtụtụ ọma' },
    hausa:      { label: 'Hausa',      flag: '🇳🇬', hello: 'Sannu', how: 'Lafiya lau?', thanks: 'Na gode', morning: 'Barka da safiya' },
    zulu:       { label: 'Zulu',       flag: '🇿🇦', hello: 'Sawubona', how: 'Unjani?', thanks: 'Ngiyabonga', morning: 'Sawubona ekuseni' },
    xhosa:      { label: 'Xhosa',      flag: '🇿🇦', hello: 'Molo', how: 'Unjani?', thanks: 'Enkosi', morning: 'Molo ekuseni' },
    shona:      { label: 'Shona',      flag: '🇿🇼', hello: 'Mhoro', how: 'Wakadii?', thanks: 'Ndatenda', morning: 'Mangwanani' },
    kinyarwanda:{ label: 'Kinyarwanda',flag: '🇷🇼', hello: 'Bite', how: 'Amakuru?', thanks: 'Murakoze', morning: 'Mwaramutse' },
    sesotho:    { label: 'Sesotho',    flag: '🇱🇸', hello: 'Dumela', how: 'O kae?', thanks: 'Ke a leboha', morning: 'Dumela hoseng' },
    malagasy:   { label: 'Malagasy',   flag: '🇲🇬', hello: 'Salama', how: 'Tsara va?', thanks: 'Misaotra', morning: 'Maraina' },
    twi:        { label: 'Twi',        flag: '🇬🇭', hello: 'Maakye', how: 'Wo ho te sɛn?', thanks: 'Medaase', morning: 'Me ma wo ha anɔpa' },
    wolof:      { label: 'Wolof',      flag: '🇸🇳', hello: 'Salaamalekum', how: 'Nanga def?', thanks: 'Jërëjëf', morning: 'Suba ak jamm' },
    luganda:    { label: 'Luganda',    flag: '🇺🇬', hello: 'Oli otya', how: 'Gyoli?', thanks: 'Webale', morning: 'Wasuze otya' },
    maori:      { label: 'Maori',      flag: '🇳🇿', hello: 'Kia ora', how: 'Kei te pēhea koe?', thanks: 'Ngā mihi', morning: 'Ata mārie' },
    samoan:     { label: 'Samoan',     flag: '🇼🇸', hello: 'Talofa', how: 'O a mai oe?', thanks: "Fa'afetai", morning: 'Manuia le taeao' },
    hawaiian:   { label: 'Hawaiian',   flag: '🇺🇸', hello: 'Aloha', how: "Pehea 'oe?", thanks: 'Mahalo', morning: 'Aloha kakahiaka' },
    quechua:    { label: 'Quechua',    flag: '🇵🇪', hello: 'Rimaykullayki', how: 'Imaynallam?', thanks: 'Sulpayki', morning: 'Allin punchaw' },
    guarani:    { label: 'Guarani',    flag: '🇵🇾', hello: "Mba'éichapa", how: "Mba'éichapa nde?", thanks: 'Aguyje', morning: "Ko'ẽ porã" },
    haitian:    { label: 'Haitian',    flag: '🇭🇹', hello: 'Bonjou', how: 'Kijan ou ye?', thanks: 'Mèsi', morning: 'Bon maten' },
    esperanto:  { label: 'Esperanto',  flag: '🌍', hello: 'Saluton', how: 'Kiel vi fartas?', thanks: 'Dankon', morning: 'Bonan matenon' },
    latin:      { label: 'Latin',      flag: '🏛️', hello: 'Salve', how: 'Quid agis?', thanks: 'Gratias', morning: 'Bonum mane' },
  };
  const langKeys = Object.keys(LANGS);

  function detectTargetLang(text) {
    const t = text.toLowerCase();
    // instruction is usually at the START or END -- check the tail first so pasted content can't hijack it
    const tailText = t.slice(-60);
    const tm = tailText.match(/(?:translate|translation|convert)\s*(?:to|into|in)?\s*([a-z]+)\s*[.?!]*$/) || tailText.match(/([a-z]+)\s+translation\s*[.?!]*$/);
    if (tm && LANGS[tm[1]]) return tm[1];
    const m = t.match(/(?:translate|translation|convert)\s*(?:to|into|in)?\s*([a-z]+)/) || t.match(/([a-z]+)\s+translation/) || t.match(/(?:in|to)\s+([a-z]+)\s+please/);
    if (m && LANGS[m[1]]) return m[1];
    for (const k of langKeys) { if (new RegExp(`\\b${k}\\b`).test(t)) return k; }
    return null;
  }
  const wantsLangList = /(all[\w\s]*languages|language options|which languages|list.*languages|show[\w\s]*languages|supported languages)/i.test(lower);
  const targetLang = detectTargetLang(last);
  // output language: explicit request wins ("tamil medium la"), else input language
  const outLang = targetLang || (/hindi me|in hindi|hindi main|hindi version/i.test(last) ? 'hindi' : (/\btamil\b/i.test(last) ? 'tamil' : (isHindi ? 'hindi' : (isTamil ? 'tamil' : 'english'))));
  // extra task intents (all-task AI, not just coding)
  const wantsMath = /[0-9]/.test(lower) && (/[+\-*/%\u00D7\u00F7^()]|percent|sqrt|square root|calculate|solve|what is/.test(lower));
  const wantsEmail = /(email|e-mail|\bmail\b|letter|resignation)/i.test(lower) && /(write|draft|need|sample|format|leave|resign|apply|job|venum|chahiye|kudu|give|send)/i.test(lower);
  const wantsEssay = /(essay|paragraph|\u0B95\u091F\u0B9F\u0BC1\u0BB0\u0BC8|katturai|redac)/i.test(lower);
  const wantsStory = /(story|stories|kathai|kadhai|\u0B95\u0BA4\u0BC8|kahani|kadha)/i.test(lower);
  const wantsJoke = /(joke|jokes|comedy|sirippu|funny|hasa|nakra)/i.test(lower);
  const wantsImage = /(image|picture|photo|poster|logo|wallpaper|drawing|painting|padam|\u0BAA\u0B9F\u0BAE\u0BCD|tasveer|thumbnail)/i.test(lower) && /(create|generat|make|draw|design|paint|venum|kudu|bana|chahiye|give|send|need|draw)/i.test(lower);
  const wantsMeaning = /(meaning of|what is|what are|\bwhats\b|define|definition of|explain\b|describe|na enna|\u0BA9\u0BBE \u0B8E\u0BA9\u0BCD\u0BA9|ka matlab|ka arth|porul enna)/i.test(lower);
  const wantsHowto = /^(how to|how do|how can|how should)|\beppadi\b|\bepdi\b|\bkaise\b/i.test(lower);

  function extractQuoted(text) {
    const m = text.match(/["'\u201C\u201D]([^"'\u201C\u201D]+)["'\u201C\u201D]/);
    return m ? m[1].trim().toLowerCase().replace(/[?!.,]+$/, '') : null;
  }
  function lookupPhrase(sentence, lang) {
    const s = sentence.toLowerCase().replace(/[?!.,]+$/, '').trim();
    const L = LANGS[lang];
    if (/^(hello|hi|hey|vanakkam|namaste)$/.test(s)) return L.hello;
    if (/how are you/.test(s)) return L.how;
    if (/thank/.test(s)) return L.thanks;
    if (/good morning/.test(s)) return L.morning;
    return null;
  }

  const E = '😊';

  // word dictionaries for translating pasted paragraphs (tech nouns stay transliterated)
  const TA_DICT = { ai: 'ஏஐ', agent: 'ஏஜெண்ட்', agents: 'ஏஜெண்டுகள்', bridge: 'பிரிட்ஜ்', universal: 'யுனிவர்சல்', chat: 'சாட்', transfer: 'டிரான்ஸ்ஃபர்', tool: 'டூல்', purpose: 'நோக்கம்', purposes: 'நோக்கங்கள்', three: 'மூன்று', main: 'முக்கிய', all: 'எல்லா', one: 'ஒரே', no: 'இல்லை', need: 'தேவை', jump: 'தாவ', between: 'இடையே', apps: 'ஆப்கள்', app: 'ஆப்', ask: 'கேளுங்கள்', auto: 'ஆட்டோ', mode: 'மோடு', best: 'சிறந்த', answers: 'பதில் தரும்', answer: 'பதில்', copy: 'காப்பி செய்து', conversation: 'உரையாடலை', other: 'வேறு', continue: 'தொடரலாம்', here: 'இங்கே', context: 'கான்டெக்ஸ்ட்', lost: 'மிஸ் ஆகாது', languages: 'மொழிகள்', language: 'மொழி', translate: 'மொழிபெயர்க்க', translation: 'மொழிபெயர்ப்பு', translations: 'மொழிபெயர்ப்புகள்', across: 'முழுவதும்', full: 'முழு', working: 'வேலை செய்யும்', code: 'கோட்', brainstorm: 'யோசித்து', ideas: 'ஐடியாக்கள்', idea: 'ஐடியா', short: 'சுருக்கமாக', power: 'பவர்', every: 'ஒவ்வொரு', try: 'முயற்சி செய்யுங்கள்', it: 'இதை', say: 'சொல்லுங்கள்', hindi: 'ஹிந்தி', calculator: 'கால்குலேட்டர்', question: 'கேள்வி', great: 'அருமை', with: 'உடன்', your: 'உங்கள்', you: 'நீங்கள்', and: 'மற்றும்', or: 'அல்லது', for: 'க்காக', of: 'இன்', to: '', from: 'இருந்து', more: 'மேலும்', get: 'பெறுங்கள்', just: 'வெறும்', instantly: 'உடனடியாக', send: 'அனுப்புங்கள்', any: 'ஏதாவது', sentence: 'வாக்கியத்தை', me: 'எனக்கு', hello: 'வணக்கம்', thank: 'நன்றி', how: 'எப்படி', good: 'நல்ல', morning: 'காலை', this: 'இது', that: 'அது', is: '', are: '', was: '', in: 'இல்', on: 'இல்', a: '', an: '', the: '', will: '', can: 'முடியும்', do: 'செய்யுங்கள்', what: 'என்ன', why: 'ஏன்', when: 'எப்போது', where: 'எங்கே', who: 'யார்', not: 'இல்லை', very: 'மிகவும்', also: 'மேலும்', have: 'உள்ளது', has: 'கொண்டுள்ளது', use: 'பயன்படுத்துங்கள்', using: 'பயன்படுத்தி', new: 'புதிய', now: 'இப்போது', today: 'இன்று', help: 'உதவி', want: 'வேண்டும்', like: 'போல', make: 'செய்யுங்கள்', give: 'கொடுங்கள்', take: 'எடுங்கள்', over: 'மேல்', up: 'மேலே', down: 'கீழே', time: 'நேரம்', day: 'நாள்', work: 'வேலை', works: 'வேலை செய்யும்', easy: 'ஈஸி', simple: 'சிம்பிள்', free: 'ஃப்ரீ', start: 'ஸ்டார்ட்', open: 'ஓபன்', save: 'சேவ்', file: 'ஃபைல்', browser: 'பிரவுசர்', love: 'காதல்', who: 'யார்', your: 'உங்கள்', name: 'பெயர்', from: 'இருந்து', old: 'வயது', age: 'வயது', about: 'பற்றி', yourself: 'உங்களை', my: 'என்', i: 'நான்', am: '' };
  const HI_DICT = { ai: 'एआई', agent: 'एजेंट', bridge: 'ब्रिज', universal: 'यूनिवर्सल', chat: 'चैट', transfer: 'ट्रांसफर', tool: 'टूल', purpose: 'उद्देश्य', purposes: 'उद्देश्य', three: 'तीन', main: 'मुख्य', all: 'सभी', one: 'एक ही', no: 'नहीं', need: 'चाहिए', jump: 'जाना', between: 'बीच', apps: 'ऐप्स', app: 'ऐप', ask: 'पूछो', auto: 'ऑटो', mode: 'मोड', best: 'सबसे अच्छा', answers: 'जवाब मिलेगा', answer: 'जवाब', copy: 'कॉपी करके', conversation: 'बातचीत को', other: 'दूसरे', continue: 'जारी रख सकते हो', here: 'यहाँ', context: 'कॉन्टेक्स्ट', lost: 'खोएगा नहीं', languages: 'भाषाओं में', language: 'भाषा में', translate: 'अनुवाद करो', translation: 'अनुवाद', full: 'पूरा', working: 'काम करने वाला', code: 'कोड', ideas: 'आइडिया', idea: 'आइडिया', short: 'संक्षेप में', power: 'पावर', every: 'हर', try: 'कोशिश करो', say: 'कहो', hindi: 'हिंदी', calculator: 'कैलकुलेटर', question: 'सवाल', great: 'बहुत बढ़िया', with: 'के साथ', your: 'तुम्हारा', you: 'तुम', and: 'और', or: 'या', for: 'के लिए', of: 'का', to: '', from: 'से', more: 'और', get: 'पाओ', just: 'बस', instantly: 'तुरंत', send: 'भेजो', any: 'कोई भी', sentence: 'वाक्य', me: 'मुझे', this: 'यह', that: 'वह', is: '', are: '', in: 'में', on: 'पर', a: '', an: '', the: '', what: 'क्या', not: 'नहीं', use: 'इस्तेमाल करो', new: 'नया', now: 'अब', help: 'मदद', like: 'जैसा', make: 'बनाओ', give: 'दो', love: 'प्यार', time: 'समय', work: 'काम', easy: 'आसान', who: 'कौन', your: 'आपका', name: 'नाम', from: 'से', old: 'उम्र', age: 'उम्र', about: 'बारे में', yourself: 'खुद', my: 'मेरा', i: 'मैं', am: 'हूँ' };
  const SI_DICT = { ai: 'ඒඅයි', agent: 'ඒජන්තයා', bridge: 'බ්‍රිජ්', universal: 'විශ්ව', chat: 'චැට්', transfer: 'ට්‍රාන්ස්ෆර්', tool: 'ටූල්', purpose: 'අරමුණ', purposes: 'අරමුණු', three: 'තුන', main: 'ප්‍රධාන', all: 'සියල්ල', one: 'එකම', no: 'නැහැ', need: 'ඕන', jump: 'පනින්න', between: 'අතර', apps: 'ඇප්', ask: 'අහන්න', auto: 'ඕටෝ', mode: 'මෝඩ්', best: 'හොඳම', answers: 'උත්තර ලැබේ', answer: 'උත්තරය', copy: 'කොපි කර', conversation: 'සංවාදය', other: 'වෙනත්', continue: 'දිගටම කරමු', here: 'මෙතන', context: 'කොන්ටෙක්ස්ට්', lost: 'නැති වෙන්නේ නැහැ', languages: 'භාෂා', language: 'භාෂාව', translate: 'පරිවර්තනය', translation: 'පරිවර්තනය', full: 'සම්පූර්ණ', working: 'වැඩ කරන', code: 'කෝඩ්', ideas: 'අදහස්', idea: 'අදහස', short: 'කෙටියෙන්', power: 'පවර්', every: 'සෑම', try: 'ට්‍රයි කරන්න', say: 'කියන්න', hindi: 'හින්දි', calculator: 'කැල්කියුලේටර්', question: 'ප්‍රශ්නය', great: 'නියමයි', with: 'සමඟ', your: 'ඔයාගේ', you: 'ඔයා', and: 'සහ', or: 'හෝ', for: 'සඳහා', of: 'ගේ', to: '', from: 'සිට', more: 'තවත්', get: 'ගන්න', just: 'පමණක්', instantly: 'ඉක්මනින්', send: 'එවන්න', any: 'ඕනම', sentence: 'වාක්‍යය', me: 'මට', hello: 'ආයුබෝවන්', thank: 'ස්තූතියි', how: 'කොහොමද', good: 'සුබ', morning: 'උදෑසන', this: 'මේ', that: 'ඒ', is: '', are: '', in: 'හි', on: 'හි', a: '', an: '', the: '', what: 'මොකක්ද', not: 'නැහැ', use: 'භාවිතා කරන්න', new: 'අලුත්', now: 'දැන්', help: 'උදව්', like: 'වගේ', make: 'හදන්න', give: 'දෙන්න', time: 'කාලය', work: 'වැඩ', easy: 'ලේසි', who: 'කාද', name: 'නම', love: 'ආදරය', my: 'මගේ', i: 'මම', am: '' };
  function dictFor(lang) { return lang === 'tamil' ? TA_DICT : lang === 'hindi' ? HI_DICT : lang === 'sinhala' ? SI_DICT : null; }
  // remove the "translate to X" instruction wrapper, keep the pasted content
  function stripInstruction(text) {
    let t = ' ' + text + ' ';
    t = t.replace(/["“”]/g, ' ');
    t = t.replace(/^\s*(please\s+)?(translate|convert)\b[^.?!]{0,60}/i, ' ');
    t = t.replace(/(translate|convert)\b[^.?!]{0,60}\s*[.?!]*$/i, ' ');
    t = t.replace(/\b\w+\s+translation\s*[.?!]*$/i, ' ');
    t = t.replace(/\b(this|that|the following|the below|the above|given text|my text)\b/gi, ' ');
    return t.replace(/[ \t]+/g, ' ').replace(/^[.?!\s,;:]+/, '').replace(/[.?!]*(?:to\s+[a-z]+\s*)?[.?!\s]*$/, '').trim();
  }
  function dictTranslateSentence(sentence, dict) {
    return sentence.split(/(\s+)/).map(tok => {
      const m = tok.match(/^([A-Za-z']+)([.,!?;:"“”)\]]*)$/);
      if (!m) return tok;
      const rep = dict[m[1].toLowerCase()];
      if (rep === undefined) return tok;
      return (rep + (m[2] || '')).trim();
    }).join('').replace(/[ \t]{2,}/g, ' ').trim();
  }

  function purposeText(lang) {
    if (lang === 'tamil') return `Nalla kelvi! ${E} **AI Bridge Agent** oru **Universal AI Chat + Transfer Tool** -- ithoda purpose moonu mukkiyamana vishayam:\n\n**1. Ella AI-yum orae chat la** -- Vera vera AI kitta thaniya poga vendaam. Inga auto mode la ketta, best AI thana pick aagi pathil tharum.\n\n**2. Chat transfer (Bridge)** -- Vera AI la pesinatha inga copy panni continue pannalaam. Context miss aagaathu.\n\n**3. 100+ mozhi + code + ideas** -- Tamil, Hindi, Arabic, French... 100+ languages la translate, calculator maathiri full working code, ideas ellam kidaikkum.\n\nSuruvi sollana: **oru chat la ella AI-yoda power-um.** Ippo try pannunga -- Translate to Hindi illa calculator code kudu nu sollunga!`;
    if (lang === 'hindi') return `Bahut badhiya sawal! ${E} **AI Bridge Agent** ek **Universal AI chat + transfer tool** hai -- iske teen main purpose:\n\n**1. Sab AI ek hi chat me** -- Alag alag apps me jaane ki zaroorat nahi. Auto mode me poochho, best AI jawab dega.\n\n**2. Chat transfer (Bridge)** -- Kisi bhi AI ki baatcheet copy karke yahan continue karo. Context kabhi lose nahi hoga.\n\n**3. 100+ bhasha + code + ideas** -- 100+ languages me translate, full working code, ideas -- sab kuch.\n\nEk line me: **ek chat me har AI ki power.** Try karo -- Translate to Hindi bolo ya calculator code mango!`;
    return `Great question! ${E} **AI Bridge Agent** is a **Universal AI chat + transfer tool** with three main purposes:\n\n**1. All AIs in one chat** -- No need to jump between apps. Ask in auto mode and the best AI answers.\n\n**2. Chat transfer (Bridge)** -- Copy a conversation from any other AI and continue it here. No context lost.\n\n**3. 100+ languages + code + ideas** -- Translate across 100+ languages, get full working code, brainstorm ideas.\n\nIn short: **every AI's power in one chat.** Try it -- say Translate to Hindi or ask for calculator code!`;
  }

  let content = '';

  // --- intent: CALCULATOR ---
  if (wantsCalculator) {
    const htmlBlock = "```html\n<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\" />\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />\n<title>Calculator</title>\n<style>\n*{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}\nbody{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;margin:0}\n.calc{width:320px;background:#1e293b;border-radius:20px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.4)}\n.display{width:100%;height:64px;background:#0f172a;color:#fff;font-size:32px;text-align:right;padding:12px 16px;border-radius:12px;border:none;outline:none;margin-bottom:14px;letter-spacing:1px}\n.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}\nbutton{height:56px;border:none;border-radius:12px;font-size:20px;cursor:pointer;transition:.15s}\nbutton:active{transform:scale(.96)}\n.num{background:#334155;color:#fff}\n.op{background:#7c3aed;color:#fff}\n.eq{background:#06b6d4;color:#fff;font-weight:700}\n.clear{background:#ef4444;color:#fff}\n.zero{grid-column:span 2}\n</style>\n</head>\n<body>\n<div class=\"calc\">\n  <input id=\"display\" class=\"display\" readonly value=\"0\" />\n  <div class=\"grid\">\n    <button class=\"clear\" onclick=\"clearAll()\">C</button>\n    <button class=\"op\" onclick=\"append('%')\">%</button>\n    <button class=\"op\" onclick=\"backspace()\">\u232B</button>\n    <button class=\"op\" onclick=\"append('/')\">\u00F7</button>\n    <button class=\"num\" onclick=\"append('7')\">7</button>\n    <button class=\"num\" onclick=\"append('8')\">8</button>\n    <button class=\"num\" onclick=\"append('9')\">9</button>\n    <button class=\"op\" onclick=\"append('*')\">\u00D7</button>\n    <button class=\"num\" onclick=\"append('4')\">4</button>\n    <button class=\"num\" onclick=\"append('5')\">5</button>\n    <button class=\"num\" onclick=\"append('6')\">6</button>\n    <button class=\"op\" onclick=\"append('-')\">\u2212</button>\n    <button class=\"num\" onclick=\"append('1')\">1</button>\n    <button class=\"num\" onclick=\"append('2')\">2</button>\n    <button class=\"num\" onclick=\"append('3')\">3</button>\n    <button class=\"op\" onclick=\"append('+')\">+</button>\n    <button class=\"num zero\" onclick=\"append('0')\">0</button>\n    <button class=\"num\" onclick=\"append('.')\">.</button>\n    <button class=\"eq\" onclick=\"calc()\">=</button>\n  </div>\n</div>\n<script>\nlet d=document.getElementById('display');\nlet cur='0';\nfunction render(){d.value=cur;}\nfunction append(v){ if(cur==='0' && v!=='.' && !'+-*/%'.includes(v)) cur=v; else cur+=v; render();}\nfunction clearAll(){cur='0';render();}\nfunction backspace(){cur=cur.length>1?cur.slice(0,-1):'0';render();}\nfunction calc(){ try{ let expr=cur.replace(/\u00F7/g,'/').replace(/\u00D7/g,'*'); if(!/^[0-9+\\-*/%.() ]+$/.test(expr)) throw 0; let val=Function('\"use strict\";return('+expr+')')(); cur=String(val);}catch{cur='Error';} render(); setTimeout(()=>{if(cur==='Error')cur='0';},900);}\n</script>\n</body>\n</html>\n```";
    if (outLang === 'tamil') {
      content = `Ippo unga calculator ready! ${E} Copy panni \`.html\` file la save panni browser la open pannunga -- udane work aagum.\n\n${htmlBlock}\n\nFeatures ellam irukku -- display, + minus x divide, %, C, backspace, decimals, error handling. File ah \`calculator.html\` nu save panni double-click pannunga. React version venumna sollunga!`;
    } else if (outLang === 'hindi') {
      content = `Aapka calculator taiyaar hai! ${E} Isko \`.html\` file me save karke browser me open karo -- turant chalega.\n\n${htmlBlock}\n\nFeatures: plus minus divide, %, clear, backspace, error handling. React version chahiye toh bolo!`;
    } else {
      content = `Your calculator is ready ${E} Just copy this into a \`.html\` file and open it in your browser -- works instantly, no build needed.\n\n${htmlBlock}\n\nIt includes a clean display, arithmetic ops, %, clear (C), backspace, decimals and safe eval with error handling. Want a React version with keyboard support? Just ask.`;
    }
  }
  // --- intent: TRANSLATION ---
  else if (wantsTranslation || wantsLangList || (targetLang && /(translat|convert|meaning)/i.test(lower))) {
    const moreLine = `\n\nMore languages? Just say *"Translate to Hindi / Spanish / French / Arabic / Malayalam..."* -- 100+ languages ready.`;
    const quoted = extractQuoted(last);
    const pasted = stripInstruction(last);
    const effLang = targetLang || 'tamil';

    if (!pasted && !quoted && wantsPurpose) {
      content = purposeText(effLang);
    } else if (pasted.length > 25 && (effLang === 'tamil' || effLang === 'hindi' || effLang === 'sinhala') && !wantsLangList) {
      // user pasted a paragraph + "translate to X" -> really translate it word-by-word
      const dict = dictFor(effLang);
      const L = LANGS[effLang];
      const sentences = pasted.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 1);
      const lines = sentences.map((s, i) => `**${i + 1}.** ${dictTranslateSentence(s, dict)}`);
      content = `${L.flag} **${L.label} translation of your text:** ${E}\n\n${lines.join('\n')}\n\n(Key tech terms stay in English so nothing is lost. Send another paragraph anytime!)${moreLine}`;
    } else if (wantsLangList && !targetLang) {
      const list = langKeys.map(k => `${LANGS[k].flag} ${LANGS[k].label}`).join('\n');
      content = `Here are all translation languages I support 🌐${E}\n\n${list}\n\nJust say *"Translate to Hindi"* (or any language above) -- or send a sentence like *"Translate \\"good morning\\" to Arabic"* and I'll do it instantly.`;
    } else if (quoted && targetLang) {
      const hit = lookupPhrase(quoted, targetLang);
      const L = LANGS[targetLang];
      if (hit) {
        content = `${L.flag} **"${quoted}" in ${L.label}:**\n\n**${hit}**\n\nSend another sentence anytime -- or ask for a different language.${moreLine}`;
      } else if (quoted.length > 3 && (targetLang === 'tamil' || targetLang === 'hindi' || targetLang === 'sinhala')) {
        // long quoted sentence -> really translate it word-by-word instead of asking for context
        const dq = dictFor(targetLang);
        const Lq = LANGS[targetLang];
        content = `${Lq.flag} **"${quoted}" in ${Lq.label}:**\n\n**${dictTranslateSentence(quoted, dq)}**\n\nSend another sentence anytime!${moreLine}`;
      } else {
        content = `${L.flag} Translating **"${quoted}"** to ${L.label}:\n\nCommon ones in ${L.label} -- **Hello \u2192 ${L.hello}** \u00B7 **How are you? \u2192 ${L.how}** \u00B7 **Thank you \u2192 ${L.thanks}**\n\nYour exact sentence needs a little context -- tell me what it means in English and I'll give you the perfect ${L.label} version instantly.${moreLine}`;
      }
    } else if (pasted.length > 0 && (effLang === 'tamil' || effLang === 'hindi' || effLang === 'sinhala')) {
      // short sentence like "who are you tamil translation" -> translate the actual sentence
      const L2 = LANGS[effLang];
      const d2 = dictFor(effLang);
      const pl = pasted.toLowerCase().replace(/[?!.,]+$/, '').trim();
      let special = null;
      if (/who are you|about yourself|introduce yourself/.test(pl)) {
        special = effLang === 'tamil'
          ? `**"Who are you?" in Tamil → Neenga yaaru? (நீங்கள் யார்?)**\n\nNaan **AI Bridge Agent** — unga universal AI assistant! ${E} Code, translation (100+ mozhi), ideas — edhu venumnaalum inga kellunga.`
          : `**"Who are you?" in Hindi → Aap kaun hain? (आप कौन हैं?)**\n\nMain **AI Bridge Agent** hoon — aapka universal AI assistant! ${E} Code, translation, ideas — sab kuch yahin poochho.`;
      } else if (/what (is|are) your name|whats your name|your name/.test(pl)) {
        special = effLang === 'tamil'
          ? `**"What is your name?" in Tamil → Unga peyar enna? (உங்கள் பெயர் என்ன?)**\n\nEnakku peyar **AI Bridge Agent**! ${E} Unga peyar enna? Sollunga, apdiye continue pannalaam.`
          : `**"What is your name?" in Hindi → Aapka naam kya hai? (आपका नाम क्या है?)**\n\nMera naam **AI Bridge Agent** hai! ${E} Aapka naam kya hai? Batao!`;
      }
      content = special || `${L2.flag} **"${pasted}" in ${L2.label}:**\n\n**${dictTranslateSentence(pasted, d2)}**\n\nInnum vera sentence anupunga!${moreLine}`;
    } else if (targetLang) {
      const L = LANGS[targetLang];
      const intro = isTamil ? `${L.label} translation ready! ${E}` : isHindi ? `${L.label} me anuvaad taiyaar hai! ${E}` : `Here you go -- ${L.label} translations ${E}`;
      const outro = isTamil ? `\n\nInnum oru sentence kudunga -- naan ${L.label} la super-a translate panni tharen.` : isHindi ? `\n\nEk vakya bhejo, main turant ${L.label} me anuvaad kar dunga.` : `\n\nSend me any sentence and I'll translate it to ${L.label} instantly.`;
      content = `${intro}\n\n**Hello \u2192 ${L.hello}**\n**How are you? \u2192 ${L.how}**\n**Thank you \u2192 ${L.thanks}**\n**Good morning \u2192 ${L.morning}**${outro}${moreLine}`;
    } else {
      content = `Here you go -- Tamil translations ${E}\n\n**Hello \u2192 ${LANGS.tamil.hello}**\n**How are you? \u2192 ${LANGS.tamil.how}**\n**Thank you \u2192 ${LANGS.tamil.thanks}**\n\nSend me any sentence and I'll translate it instantly -- Tamil, Hindi or English, whatever you need.${moreLine}`;
    }
  }
  // --- intent: PROJECT PURPOSE ---
  else if (wantsPurpose) {
    content = purposeText(outLang);
  }
// --- intent: CODE ---
  else if (wantsCode) {
    if (/(react|useeffect)/i.test(lower)) {
      content = `Got it -- your \`useEffect\` is looping because \`data\` is in the deps. Here's a clean fix:\n\n\`\`\`jsx\nimport { useEffect, useState, useCallback } from 'react';\n\nfunction DataView() {\n  const [data, setData] = useState(null);\n  const [loading, setLoading] = useState(false);\n\n  const fetchData = useCallback(async () => {\n    setLoading(true);\n    try {\n      const r = await fetch('/api/data');\n      const j = await r.json();\n      setData(j);\n    } finally { setLoading(false); }\n  }, []);\n\n  useEffect(() => { fetchData(); }, [fetchData]);\n\n  if (loading) return <p>Loading...\u2026</p>;\n  return <pre>{JSON.stringify(data, null, 2)}</pre>;\n}\n\`\`\`\n\nWhy it looped: \`[data]\` + \`setData(data)\` inside the effect creates an infinite cycle. Fix it with \`useCallback\` and an empty dep array. Want a TypeScript + AbortController version? Just ask!`;
    } else {
      if (isTamil) {
        content = `Code ready! ${E} Neenga ketta vishayathukku clean working starter itho:\n\n\`\`\`js\nfunction solve(input) {\n  return input; // unga logic inga maathunga\n}\nconsole.log(solve('hello'));\n\`\`\`\n\nEntha language / framework nu sollunga -- React, Python, Node nu exacta maathi full file ah ready panni tharen.`;
      } else if (isHindi) {
        content = `Yeh raha clean code starter ${E}\n\n\`\`\`js\nfunction solve(input){ return input; }\nconsole.log(solve('hello'));\n\`\`\`\n\nLanguage / framework batao -- React / Python / Node ka pura working code turant bana dunga.`;
      } else {
        content = `Here's a clean working starter for that:\n\n\`\`\`js\nfunction solve(input) {\n  return input; // replace with your logic\n}\nconsole.log(solve('hello'));\n\`\`\`\n\nTell me your language and goal (like "React calculator" or "Python API") and I'll give you a full file with styles, error handling and how to run it.`;
      }
    }
  }
  // --- Tamil exact help phrase ---
  else if (isTamilHelpExact) {
    content = `Aama, kandippa help pannalam! ${E} Enna help venum sollunga -- code, translation, idea, illana edhavadhu specific-a ketta udane best-a pannitharen.`;
  }
  // --- Greeting short ---
  else if (isGreetingShort) {
    if (isTamil) {
      content = `Vanakkam! ${E} Eppadi irukkeenga? Enna help venum sollunga -- code, translation, idea ellam naan ready!`;
    } else if (isHindi) {
      content = `Namaste! ${E} Kaise hain aap? Bataiye kya help chahiye -- code, translation ya koi idea -- main taiyaar hoon!`;
    } else {
      content = `Hey there! 👋 How can I help you today? Ask me for code, translation, ideas, or just chat -- I'm here for whatever you need.`;
    }
  }
  // --- Ideas requested ---
  else if (wantsIdeas) {
    if (isTamil) {
      content = `Super! Ungalukku konjam ideas tharen ${E}\n\n- Chinna prototype la start panni test pannunga\n- Ready template / code reuse panni neram save pannunga\n- Feedback vangi iterate pannunga -- periya project kooda easy aaidum\n\nIntha ideas la ethu pidichirukku sollunga, naan atha virivaa explain panni code kooda tharen!`;
    } else {
      content = `Here are a few ideas to get you started ${E}\n\n- Start with a tiny prototype and test early\n- Reuse a template or working sample to save time\n- Get feedback quickly and iterate\n\nTell me which direction you like and I'll expand it with code or a plan!`;
    }
  }
  // --- intent: MATH (safe arithmetic + percentage) ---
  else if (wantsMath) {
    let mathOut = null;
    const pct = lower.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/);
    if (pct) {
      const v = parseFloat(pct[2]) * parseFloat(pct[1]) / 100;
      mathOut = `${pct[1]}% of ${pct[2]} = **${Number(v.toFixed(4))}**`;
    } else {
      let expr = last.replace(/[\u00D7x]/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-');
      expr = expr.replace(/what is|calculate|solve|compute|please|\?|answer|equals?/gi, ' ').trim();
      if (/^[0-9+\-*/%.()\s]+$/.test(expr) && /\d/.test(expr) && /[+\-*/%()]/.test(expr)) {
        try {
          const v = Function('"use strict";return(' + expr + ')')();
          if (typeof v === 'number' && isFinite(v)) mathOut = `${expr.trim()} = **${Number(v.toFixed(6))}**`;
        } catch {}
      }
    }
    if (mathOut) {
      const pre = outLang === 'tamil' ? `Kanaku ready! ${E}` : outLang === 'hindi' ? `Hisab taiyaar hai! ${E}` : `Here you go! ${E}`;
      content = `${pre}\n\n🧮 ${mathOut}\n\nVera kanaku iruntha kudunga -- percentage, multiply, divide ellam okay!`;
    } else {
      const pre2 = outLang === 'tamil' ? `Antha kanakka konjam theliva kudunga ${E} -- example: "12*8" illa "15% of 200".` : outLang === 'hindi' ? `Sawal thoda saaf likho ${E} -- jaise "12*8" ya "15% of 200".` : `Send the sum clearly ${E} -- like "12*8" or "15% of 200" and I'll solve it instantly.`;
      content = pre2;
    }
  }
  // --- intent: EMAIL / LETTER ---
  else if (wantsEmail) {
    const kind = /resign/i.test(lower) ? 'resign' : /job|apply|application/i.test(lower) ? 'job' : 'leave';
    const subj = kind === 'resign' ? 'Subject: Resignation -- [Your Name], [Department]' : kind === 'job' ? 'Subject: Application for [Position Name]' : 'Subject: Leave Application -- [Date]';
    const body = kind === 'resign'
      ? `Dear [Manager Name],\n\nI am writing to resign from my position of [Your Role] at [Company]. My last working day will be [Date, notice period]. Thank you for the opportunities and support.\n\nI will complete my handover properly.\n\nRegards,\n[Your Name]\n[Phone]`
      : kind === 'job'
      ? `Dear Hiring Manager,\n\nI am applying for the position of [Position Name]. I have [X years] experience in [Skill]. I would love to discuss how I can contribute to [Company].\n\nResume attached. Thank you for your time.\n\nRegards,\n[Your Name]\n[Phone] | [Email]`
      : `Dear [Manager/Teacher Name],\n\nI kindly request leave on [Date] due to [reason: fever / personal work / family function]. I will finish my pending tasks before / after. Please approve.\n\nThank you,\n[Your Name]\n[Class / Department]`;
    const pre = outLang === 'tamil' ? `Email ready! ${E} [ ] bracket la unga details fill pannunga:` : outLang === 'hindi' ? `Email taiyaar hai! ${E} [ ] me apni details bharo:` : `Email ready! ${E} Fill your details in [ ]:`;
    content = `${pre}\n\n**${subj}**\n\n${body}\n\nVera type venumna sollunga -- apology, invitation, complaint, follow-up ellam ready panni tharen!`;
  }
  // --- intent: ESSAY ---
  else if (wantsEssay) {
    let topic = (lower.match(/(?:essay|paragraph)\s+(?:on|about|for)\s+(.+?)(?:\s+in (?:tamil|hindi|english)|\s+please|\?|$)/) || lower.match(/(?:on|about)\s+(.+?)(?:\s+in (?:tamil|hindi|english)|\s+please|\?|$)/) || [])[1] || 'my favourite topic';
    topic = topic.trim().replace(/^(an?|the)\s+/i, '');
    const Title = topic.charAt(0).toUpperCase() + topic.slice(1);
    const pre = outLang === 'tamil' ? `Essay ready! ${E} Copy panni use pannunga:` : outLang === 'hindi' ? `Nibandh taiyaar hai! ${E}` : `Essay ready! ${E} Copy and use it:`;
    content = `${pre}\n\n**${Title}**\n\n${Title} is one of the most important topics in our daily life. It affects every person, family and society in many ways. In this essay we will see what it means, why it matters, and how we can handle it well.\n\nFirst, ${topic} helps us grow and learn. When we understand it properly, we can take better decisions at school, work and home. Experts also say that caring about ${topic} early gives the best results.\n\nSecond, ignoring ${topic} creates problems. Small issues become big when we delay. So discipline, regular practice and asking good questions are the keys.\n\nIn conclusion, ${topic} deserves our time and attention. If every student and citizen acts sincerely, the future will be bright.\n\n(Vera topic venumna sollunga -- Tamil / Hindi essay-um tharen!)`;
  }
  // --- intent: STORY ---
  else if (wantsStory) {
    if (outLang === 'tamil') content = `Kadhai ready! ${E}\n\n**Dhahamulla Kaakam (தாகமுள்ள காகம்)**\n\nOru kaakam romba thaaham ah irunthuchu. Engum thedi paarthuchu -- kadaisila oru kudam theriyuthu, aana thanni romba keezha irunthuchu. Kaakam yosichu -- chinna chinna kall ah eduthu kudathula potuchu. Thanni mela vanthuchu, kudichu santhoshama paranthu pochu!\n\n**Needhi:** *Muyarchi + budhisalithanam = vetri!*\n\nVera kadhai venumna sollunga -- muyal-aamai race, lion-mouse friendship ellam irukku!`;
    else if (outLang === 'hindi') content = `Kahani taiyaar hai! ${E}\n\n**Pyasa Kauwa**\n\nEk kauwa bahut pyasa tha. Idhar udhar dekha -- ek ghada mila, lekin paani bahut neeche tha. Kaue ne socha -- chhote chhote patthar uthakar ghade me daale. Paani upar aaya, pi liya aur khush hokar ud gaya!\n\n**Seekh:** *Koshish + akal = jeet!*\n\nAur kahani chahiye? Khargosh-kachhua race, sher-chuha dosti -- sab hai!`;
    else content = `Story time! ${E}\n\n**The Thirsty Crow**\n\nA crow was very thirsty. It searched everywhere and found a pot -- but the water was too low. The crow thought hard, picked up small pebbles one by one and dropped them in. The water rose up, it drank happily and flew away!\n\n**Moral:** *Effort + cleverness = success!*\n\nWant another? Rabbit-tortoise race, lion-mouse friendship -- just ask!`;
  }
  // --- intent: JOKE ---
  else if (wantsJoke) {
    if (outLang === 'tamil') content = `Sirippu ready! ${E}\n\n1. Teacher: "Homework enna aachu?" Student: "Naan phone la save panni vechuruken miss -- phone veetla irukku!"\n\n2. Doctor: "Unakku enna prachana?" Patient: "Dheetukku diet iruken doctor -- aana diet food ah paartha pasikuthu!"\n\n3. Friend: "Exam eppadi?" Me: "Question paper ah paarthathum -- ellame déjà vu maathiri, aana answer theriyala!"\n\nInnum venumna sollunga -- ungalukku non-stop comedy tharen!`;
    else if (outLang === 'hindi') content = `Hasi taiyaar hai! ${E}\n\n1. Teacher: "Homework kahan hai?" Student: "Ma'am, phone me save tha -- phone ghar par reh gaya!"\n\n2. Pappu: "Exam kaisa gaya?" Gappu: "Paper dekhkar laga sab aata hai -- likhte time sab bhool gaya!"\n\n3. Doctor: "Kya problem hai?" Patient: "Neend nahi aati!" Doctor: "Mobile door rakho!" Patient: "Phir alarm kaun lagayega?!"\n\nAur chahiye? Bolo, hasaata rahunga!`;
    else content = `Jokes incoming! ${E}\n\n1. Teacher: "Where's your homework?" Student: "It's saved on my phone, miss -- and my phone is at home!"\n\n2. Why did the developer go broke? Because he used up all his cache!\n\n3. I told my friend 10 jokes to make him laugh... sadly no pun in ten did!\n\nWant more? Say the word -- unlimited comedy!`;
  }
  // --- intent: IMAGE (SVG poster you can save & open) ---
  else if (wantsImage) {
    let title = last.replace(/(please\s+)?(create|generate|make|draw|design|paint)\s*/gi, ' ').replace(/(image|picture|photo|poster|logo|wallpaper|drawing|painting|padam|tasveer|thumbnail|of|a|an|the|for|me|enakku|mujhe|venum|kudu|banao|chahiye|karo|do|give|send|need|one|oru)\s*/gi, ' ').replace(/[.?!]+$/, '').trim().split(/\s+/).slice(0, 4).join(' ');
    if (!title) title = 'AI Bridge';
    const Title = title.replace(/[<>&"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset=".55" stop-color="#2563eb"/><stop offset="1" stop-color="#06b6d4"/></linearGradient><radialGradient id="o" cx=".8" cy=".15" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="800" height="500" rx="28" fill="#060818"/><rect width="800" height="500" rx="28" fill="url(#g)" opacity=".28"/><rect width="800" height="500" rx="28" fill="url(#o)"/><circle cx="120" cy="90" r="46" fill="none" stroke="#8b5cf6" stroke-width="3" opacity=".7"/><circle cx="690" cy="410" r="60" fill="none" stroke="#22d3ee" stroke-width="3" opacity=".5"/><text x="400" y="225" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="bold" fill="#fff">${Title}</text><rect x="330" y="260" width="140" height="6" rx="3" fill="#22d3ee"/><text x="400" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" fill="#c4b5fd">Made with AI Bridge Agent</text></svg>`;
    const pre = outLang === 'tamil' ? `Image ready! ${E} Keel irukkuratha copy panni \`.svg\` file la save panni browser la open pannunga -- unga poster theriyum:` : outLang === 'hindi' ? `Image taiyaar hai! ${E} Neeche wala copy karke \`.svg\` file me save karo, browser me kholo:` : `Image ready! ${E} Copy this into a \`.svg\` file and open it in your browser:`;
    content = `${pre}\n\n\`\`\`svg\n${svg}\n\`\`\`\n\nTitle ah maara venumna sollunga -- vera colour, vera words oda pudhu poster ready panni tharen! (PNG venumna: browser la open panni screenshot edunga ${E})`;
  }
  // --- intent: MEANING / DEFINITION ---
  else if (wantsMeaning) {
    let term = (lower.match(/(?:meaning of|what is|what are|define|definition of|explain|describe)\s+(.+?)(?:\s+in (?:tamil|hindi|english)|\?|$)/) || lower.match(/(.+?)\s*(?:na enna|\u0BA9\u0BBE \u0B8E\u0BA9\u0BCD\u0BA9|ka matlab|ka arth|porul enna)/) || [])[1] || '';
    term = term.trim().replace(/^(an?|the)\s+/i, '').replace(/[.?!]+$/, '');
    if (!term || term.length > 60) {
      content = outLang === 'tamil' ? `Entha word-/concept puriyanum nu sollunga ${E} -- example: "photosynthesis na enna" illa "what is gravity".` : outLang === 'hindi' ? `Kaun sa shabd samajhna hai batao ${E} -- jaise "gravity kya hai".` : `Tell me which word or concept ${E} -- like "what is gravity" -- and I'll explain it simply with examples.`;
    } else {
      const T1 = term.charAt(0).toUpperCase() + term.slice(1);
      if (outLang === 'tamil') content = `**${T1} na enna?** ${E}\n\n**Simple meaning:** ${T1} nu sonna -- namma daily life la use aagura oru mukkiyamana concept. Easy ah sollana: athu oru vishayam eppadi work aaguthu nu vilakkura idea.\n\n**3 mukkiyamana vishayam:**\n1. **Enna** -- ${T1} oda basic definition ah purinjikonga.\n2. **Enga use** -- school, work, news la athu eppadi varuthu nu paarunga.\n3. **Yen mukkiyam** -- athu theriyama iruntha enna miss pannuvom nu yosinga.\n\n**Example:** "Enakku ${term} puriyuthu" -- ipdi oru sentence la use panni paarunga, manasula fix aaidum!\n\nVera word venumna sollunga!`;
      else if (outLang === 'hindi') content = `**${T1} kya hai?** ${E}\n\n**Simple matlab:** ${T1} rozmarra ki zindagi ka ek zaroori concept hai. Aasan bhasha me -- yeh samjhata hai ki koi cheez kaise kaam karti hai.\n\n**3 khaas baatein:**\n1. **Kya** -- ${T1} ki basic definition samjho.\n2. **Kahan** -- school, kaam, news me yeh kahan dikhta hai dekho.\n3. **Kyun** -- yeh kyun zaroori hai socho.\n\n**Example:** "${T1} mujhe samajh aaya" -- aise ek vakya banao, yaad rahega!\n\nAur shabd poochho!`;
      else content = `**What is ${term}?** ${E}\n\n**Simple meaning:** ${T1} is an important concept you meet in daily life, school and news. In one line: it's the idea that explains how something works or what something means.\n\n**3 key angles:**\n1. **What** -- the basic definition of ${term}.\n2. **Where** -- where you see it (school, work, conversations).\n3. **Why it matters** -- what you gain by understanding it.\n\n**Example:** Try using it today -- "I finally understand ${term}!" -- using a word fixes it in memory.\n\nAsk another word anytime!`;
    }
  }
  // --- intent: HOW-TO ---
  else if (wantsHowto) {
    let task = lower.replace(/^(how to|how do i|how can i|how should i)\s*/i, '').replace(/^(eppadi|epdi)\s*/i, '').replace(/^(kaise)\s*/i, '').replace(/[.?!]+$/, '').trim() || 'this task';
    const T1 = task.charAt(0).toUpperCase() + task.slice(1);
    if (outLang === 'tamil') content = `**${T1} -- eppadi seiyanum?** ${E}\n\n**Steps:**\n1. **Prepare** -- thevaiyaana items/notes ah ready pannunga.\n2. **Start small** -- chinna step la start panni try pannunga.\n3. **Check** -- sariya pogutha nu check panni thiruthunga.\n4. **Finish** -- mudichu result ah verify pannunga.\n\nSpecific task ah sonna (example: "how to make tea") naan exacta steps + tips oda tharen!`;
    else if (outLang === 'hindi') content = `**${T1} -- kaise karein?** ${E}\n\n**Steps:**\n1. **Taiyaari** -- zaroori cheezein ready rakho.\n2. **Chhota start** -- chhote step se shuru karo.\n3. **Check** -- sahi ja raha hai dekho, sudharo.\n4. **Finish** -- result verify karo.\n\nExact kaam batao (jaise "chai kaise banaye") -- steps + tips dunga!`;
    else content = `**How to ${task}?** ${E}\n\n**Steps:**\n1. **Prepare** -- get what you need ready.\n2. **Start small** -- try the tiniest version first.\n3. **Check** -- verify, fix, improve.\n4. **Finish** -- confirm the result.\n\nTell me the exact task (like "how to make tea") and I'll give precise steps + pro tips!`;
  }
    // --- GENERAL (quotes user's words, never generic) ---
  else {
    const q = last.length > 90 ? last.slice(0, 90) + '...' : last;
    const hint = /(code|coding|program|app|website|bug)/i.test(lower) ? (outLang === 'tamil' ? 'Code sample venumna sollunga -- full working file tharen.' : 'Want a code sample? Just say so -- full working file.') : /(translat|tamil|hindi|english)/i.test(lower) ? (outLang === 'tamil' ? 'Translate panna sentence ah kudunga.' : 'Send the sentence to translate.') : (outLang === 'tamil' ? 'Konjam detail kudunga -- code, translation, idea, steps -- ethu venum?' : outLang === 'hindi' ? 'Thoda detail batao -- code, translation, idea, steps?' : 'Give me a little more detail -- code, translation, idea, steps?');
    if (outLang === 'tamil') {
      content = `Sari, '"${q}"' -- itha pathi pesalaam! ${E}\n\nEnakku purinjathu: neenga ithula best answer ah ethirpaakureenga. ${hint}\n\nMath, email, essay, kadhai, joke, image, meaning -- ethu venumnaalum orae chat la pannalaam. Just kellunga!`;
    } else if (outLang === 'hindi') {
      content = `Theek hai, '"${q}"' -- is par baat karte hain! ${E}\n\n${hint}\n\nMaths, email, nibandh, kahani, joke, image, meaning -- sab kuch ek hi chat me. Bas poochho!`;
    } else {
      if (lower.length > 50) {
        content = `Got it -- "${q}" ${E}\n\nHere's my take: clarify the exact outcome you want, and I'll deliver it ready-to-use (steps, code, text, or ideas). ${hint}`;
      } else {
        content = `Hey! You said: "${q}" ${E}\n\nI'm on it -- tell me what output you want and I'll make it happen. ${hint}\n\nI can also do maths, emails, essays, stories, jokes, images, meanings -- all in this chat.`;
      }
    }
  }
  const usage = {
    prompt_tokens: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
    completion_tokens: Math.ceil(content.length / 4),
    total_tokens: Math.ceil((messages.reduce((a, m) => a + m.content.length, 0) + content.length) / 4),
  };

  return {
    ok: true,
    content,
    model: model,
    provider: 'ai-bridge',
    usage,
    raw: { mock: true, intelligent: true },
    fallback: false,
  };
}
