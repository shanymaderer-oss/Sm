/* מסע · the smart guide server: a Cloudflare Worker that keeps our Gemini key secret and lets every traveler use the guide.
   What it protects against:
   - the key never reaches the browser (it is a Worker secret: GEMINI_KEY);
   - only our site may call it from a browser (Origin check), and only POST /generate;
   - nobody can use it as a free general Gemini: the request is rebuilt from a few allowed fields, sizes are capped,
     answers are short (max 1024 tokens), no tools, no files;
   - one person cannot use up the day: a limit per address per minute and per day;
   - cost: the key comes from Google AI Studio WITHOUT billing, so the worst case is "quota used up", never a bill.
   Settings (Cloudflare → the Worker → Settings → Variables): GEMINI_KEY (secret, required), MODEL (optional). */
const ORIGINS = ["https://shanymaderer-oss.github.io", "http://localhost:8790"];
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const PER_MIN = 12, PER_DAY = 120, MAX_BODY = 24000;
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

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: ORIGINS.includes(origin) ? 204 : 403, headers: cors(origin) });
    if (url.pathname !== "/generate" || req.method !== "POST") return reply(404, { error: "not found" }, origin);
    if (!ORIGINS.includes(origin)) return reply(403, { error: "origin" }, origin);
    if (!env.GEMINI_KEY) return reply(503, { error: "not configured" }, origin);
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const lim = limited(ip);
    if (lim) return reply(429, { error: "busy", scope: lim === "day" ? "you" : "minute" }, origin);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(413, { error: "too big" }, origin);
    let body; try { body = clean(JSON.parse(raw)); } catch { body = null; }
    if (!body) return reply(400, { error: "bad request" }, origin);
    const models = env.MODEL ? [env.MODEL, ...MODELS] : MODELS;
    for (const m of models) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(body)
      });
      if (r.status === 404) continue; // that model is gone: try the next one
      if (r.status === 429) {
        let msg = ""; try { msg = (await r.json()).error?.message || ""; } catch {}
        return reply(429, { error: "busy", scope: /per ?day|daily/i.test(msg) ? "day" : "minute" }, origin);
      }
      if (!r.ok) return reply(502, { error: "upstream " + r.status }, origin);
      const j = await r.json();
      // only the answer goes back, nothing else from Google's reply
      return reply(200, { candidates: [{ content: { parts: [{ text: (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("") }] } }] }, origin);
    }
    return reply(502, { error: "no model" }, origin);
  }
};
