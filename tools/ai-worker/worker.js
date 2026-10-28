/* מסע · the smart guide server: a Cloudflare Worker that keeps our Gemini key secret and lets every traveler use the guide.
   What it protects against:
   - the key never reaches the browser (it is a Worker secret: GEMINI_KEY);
   - only our site may call it from a browser (Origin check), and only POST /generate;
   - nobody can use it as a free general Gemini: the request is rebuilt from a few allowed fields, sizes are capped,
     answers are short (max 1024 tokens), no tools, no files;
   - one person cannot use up the day: a limit per address per minute and per day;
   - cost: the key comes from Google AI Studio WITHOUT billing, so the worst case is "quota used up", never a bill.
   Fresh information (optional, TAVILY_KEY): for questions about now (open on a holiday, events this week, strikes) the
   guide first searches the web through Tavily and answers from those results, with links. Tavily's terms allow using
   results to answer the question being asked, never storing them: nothing is kept here or in the app.
   Searches are capped (per address and per day) so the free 1,000 a month last.
   Settings (Cloudflare → the Worker → Settings → Variables): GEMINI_KEY (secret, required), TAVILY_KEY (secret, optional), MODEL (optional). */
const ORIGINS = ["https://shanymaderer-oss.github.io", "http://localhost:8790"];
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
const PER_MIN = 12, PER_DAY = 120, MAX_BODY = 24000;
const FRESH_PER_IP = 8, FRESH_PER_DAY = 30;
const freshSeen = new Map(); let freshDay = -1, freshCount = 0;
function freshAllowed(ip, now = Date.now()) {
  const d = Math.floor(now / 86400000);
  if (d !== freshDay) { freshDay = d; freshCount = 0; freshSeen.clear(); }
  const n = freshSeen.get(ip) || 0;
  if (freshCount >= FRESH_PER_DAY || n >= FRESH_PER_IP) return false;
  freshCount++; freshSeen.set(ip, n + 1);
  return true;
}
const seen = new Map(); // address -> {m: minute, mn: count this minute, d: day, dn: count today}; per Worker instance, best effort

function cors(origin) {
  return ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } : {};
}
const reply = (status, obj, origin) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors(origin) } });

function limited(ip, now = Date.now()) {
  const m = Math.floor(now / 60000), d = Math.floor(now / 86400000);
  const r = seen.get(ip) || { m, mn: 0, d, dn: 0 };
  if (r.m !== m) { r.m = m; r.mn = 0; }
  if (r.d !== d) { r.d = d; r.dn = 0; }
  if (r.dn >= PER_DAY) return "day";
  if (r.mn >= PER_MIN) return "minute";
  r.mn++; r.dn++; seen.set(ip, r);
  if (seen.size > 5000) seen.delete(seen.keys().next().value);
  return "";
}

const text = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
/* only what the site sends: a system text, up to 12 turns of text, and a few generation settings */
function clean(b) {
  if (!b || typeof b !== "object" || !Array.isArray(b.contents) || !b.contents.length) return null;
  const contents = b.contents.slice(-12).map(c => ({
    role: c && c.role === "model" ? "model" : "user",
    parts: [{ text: text((c && Array.isArray(c.parts) ? c.parts : []).map(p => text(p && p.text, 6000)).join("\n"), 6000) }]
  })).filter(c => c.parts[0].text);
  if (!contents.length || contents[contents.length - 1].role !== "user") return null;
  const out = { contents };
  const sys = text(b.systemInstruction && Array.isArray(b.systemInstruction.parts) && b.systemInstruction.parts[0] && b.systemInstruction.parts[0].text, 8000);
  if (sys) out.systemInstruction = { parts: [{ text: sys }] };
  const g = b.generationConfig || {};
  out.generationConfig = {
    temperature: Math.min(1, Math.max(0, +g.temperature || 0.7)),
    maxOutputTokens: Math.min(1024, Math.max(64, +g.maxOutputTokens || 1024))
  };
  if (g.responseMimeType === "application/json") out.generationConfig.responseMimeType = "application/json";
  return out;
}

async function gemini(env, body) {
  const models = env.MODEL ? [env.MODEL, ...MODELS] : MODELS;
  let last = { status: 502 };
  for (const m of models) {
    // 2.5 models "think" before answering by default: slow, and not needed for a travel answer
    const b = /^gemini-2\.5/.test(m) ? { ...body, generationConfig: { ...(body.generationConfig || {}), thinkingConfig: { thinkingBudget: 0 } } } : body;
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 20000);
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(b), signal: ac.signal
      });
    } catch { last = { status: 502, code: 504, why: "TIMEOUT" }; continue; } // too slow: try the next model
    finally { clearTimeout(timer); }
    if (r.status === 404) continue; // that model is gone: try the next one
    if (r.status >= 500) { last = { status: 502, code: r.status, why: "BUSY" }; continue; } // overloaded right now: try the next model
    if (r.status === 429) {
      let msg = ""; try { msg = (await r.json()).error?.message || ""; } catch {}
      return { status: 429, scope: /per ?day|daily/i.test(msg) ? "day" : "minute" };
    }
    if (!r.ok) { let why = ""; try { why = ((await r.json()).error?.status || "").slice(0, 40); } catch {} return { status: 502, code: r.status, why }; }
    const j = await r.json();
    return { status: 200, text: (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("") };
  }
  return last;
}
/* a web search through Tavily: titles, links and a short piece of each page, used for this answer only */
async function tavily(env, query) {
  try {
    const r = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_KEY}` },
      body: JSON.stringify({ query: query.slice(0, 300), search_depth: "basic", max_results: 5, include_answer: false, include_images: false }) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || []).filter(x => /^https:\/\//.test(x.url || "")).slice(0, 5)
      .map(x => ({ title: text(x.title, 140), url: text(x.url, 400), snippet: text(x.content, 600) }));
  } catch { return []; }
}
const today = () => new Date().toISOString().slice(0, 10);

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: ORIGINS.includes(origin) ? 204 : 403, headers: cors(origin) });
    if (!["/generate", "/fresh", "/translate"].includes(url.pathname) || req.method !== "POST") return reply(404, { error: "not found" }, origin);
    if (!ORIGINS.includes(origin)) return reply(403, { error: "origin" }, origin);
    if (!env.GEMINI_KEY) return reply(503, { error: "not configured" }, origin);
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const lim = limited(ip);
    if (lim) return reply(429, { error: "busy", scope: lim === "day" ? "you" : "minute" }, origin);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(413, { error: "too big" }, origin);
    let parsed; try { parsed = JSON.parse(raw); } catch { parsed = null; }

    // descriptions from Wikivoyage and Wikipedia that exist only in English, into plain Hebrew
    if (url.pathname === "/translate") {
      const texts = Array.isArray(parsed?.texts) ? parsed.texts.slice(0, 6).map(t => text(t, 1500)).filter(Boolean) : [];
      if (!texts.length) return reply(400, { error: "bad request" }, origin);
      const g = await gemini(env, { contents: [{ role: "user", parts: [{ text: `Translate each of these travel descriptions into natural, fluent Hebrew for Israeli travelers. Keep place names as they are commonly written in Hebrew, or in Latin letters when there is no common Hebrew name. Do not add anything. Answer with a JSON array of strings, in the same order.\n${JSON.stringify(texts)}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" } });
      if (g.status === 429) return reply(429, { error: "busy", scope: g.scope }, origin);
      let out = null; try { out = JSON.parse(g.text); } catch {}
      if (!Array.isArray(out) || out.length !== texts.length) return reply(502, { error: "upstream" }, origin);
      return reply(200, { texts: out.map(x => text(x, 3000)) }, origin);
    }

    // what is on in the city on the trip's dates: a list of links, straight from the search
    if (url.pathname === "/fresh") {
      const city = text(parsed?.city, 60).replace(/[^\p{L}\p{N} .,'-]/gu, ""), month = text(parsed?.month, 30).replace(/[^\p{L}\p{N} ]/gu, "");
      if (parsed?.kind !== "events" || !city) return reply(400, { error: "bad request" }, origin);
      if (!env.TAVILY_KEY) return reply(503, { error: "no search" }, origin);
      if (!freshAllowed(ip)) return reply(429, { error: "busy", scope: "search" }, origin);
      return reply(200, { results: await tavily(env, `${city} events festivals concerts exhibitions ${month}`), via: "Tavily" }, origin);
    }

    const body = clean(parsed);
    if (!body) return reply(400, { error: "bad request" }, origin);
    // a question about now: search first, then answer from what was found
    let sources = [];
    const sq = text(parsed?.search?.q, 300), sc = text(parsed?.search?.city, 60);
    if (sq && env.TAVILY_KEY && freshAllowed(ip)) {
      const qr = await gemini(env, { contents: [{ role: "user", parts: [{ text: `Write one short English web search query (max 12 words, no quotes) to answer this traveler's question about ${sc || "their destination"} as of ${today()}:\n${sq}` }] }], generationConfig: { temperature: 0, maxOutputTokens: 40 } });
      const query = qr.status === 200 && qr.text ? qr.text.split("\n")[0].replace(/["']/g, "") : `${sc} ${sq}`;
      sources = await tavily(env, query);
      if (sources.length) {
        const found = sources.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${x.snippet}`).join("\n\n");
        const sys = body.systemInstruction?.parts[0].text || "";
        body.systemInstruction = { parts: [{ text: `${sys}\n\nToday is ${today()}. Fresh web search results for the traveler's last question (they may be wrong or old; prefer official sites, say when unsure, and mention which source by its site name):\n${found}`.slice(0, 14000) }] };
      }
    }
    const g = await gemini(env, body);
    if (g.status === 429) return reply(429, { error: "busy", scope: g.scope }, origin);
    if (g.status !== 200) return reply(502, { error: "upstream", code: g.code || 0, why: g.why || "" }, origin);
    // only the answer (and the links it used) goes back, nothing else from Google's or Tavily's reply
    return reply(200, { candidates: [{ content: { parts: [{ text: g.text }] } }], sources: sources.map(x => ({ title: x.title, url: x.url })) }, origin);
  }
};
