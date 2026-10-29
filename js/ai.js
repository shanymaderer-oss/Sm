/* מסע · the smart guide through the Google Gemini API free tier.
   Open to everyone: when the site has a guide server (window.MASA_AI.proxy, a small Cloudflare Worker that keeps our
   key secret, see tools/ai-worker) every traveler gets the guide without doing anything.
   A traveler may still paste a key of their own; it stays in this browser only and goes straight to Google.
   Without either, the site works on open data and the guide answers from the trip itself. */
window.Masa = window.Masa || {};
Masa.ai = (() => {
  const BASE = "https://generativelanguage.googleapis.com/v1beta";
  const KEY = "masa-gemini-key", MODEL = "masa-gemini-model";
  const FALLBACK_MODEL = "gemini-flash-lite-latest";
  const get = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

  const testing = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && get("masa-ai-test") === "1";
  const SHARED = testing ? location.origin + "/__ai" : ((window.MASA_AI && window.MASA_AI.proxy) || "");
  let sharedOff = false; // the shared guide said it is out of quota: until the page reloads, do not keep asking
  const own = () => !!get(KEY);
  const shared = () => !!SHARED && !own();
  const enabled = () => own() || (!!SHARED && !sharedOff);
  const model = () => own() ? get(MODEL) : SHARED ? "Gemini (משותף)" : "";

  async function fail(r) {
    let body = {};
    try { body = await r.json(); } catch {}
    const msg = body?.error?.message || "";
    const code = r.status === 429 ? "quota"
      : (r.status === 400 && /API key/i.test(msg)) || r.status === 401 || r.status === 403 ? "bad_key"
      : r.status === 404 ? "no_model" : "ai_error";
    return Object.assign(new Error(msg || "HTTP " + r.status), { code });
  }

  /* Pick the newest free "Flash" model this key can use, so the site keeps working as models change. */
  async function pickModel(force) {
    const saved = !force && model();
    if (saved) return saved;
    const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(get(KEY))}`);
    if (!r.ok) throw await fail(r);
    const j = await r.json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""));
    const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const stable = names.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const other = names.filter(n => /flash/.test(n) && !/(lite|image|tts|audio|live|embed|thinking|exp|8b)/.test(n)).sort((a, b) => ver(b) - ver(a));
    const m = stable[0] || other[0] || FALLBACK_MODEL;
    set(MODEL, m);
    return m;
  }

  let sources = [];
  async function generate(body, search) {
    sources = [];
    if (shared()) {
      if (search) body = { ...body, search };
      if (sharedOff) throw Object.assign(new Error("off"), { code: "shared_quota" });
      let r;
      try { r = await fetch(SHARED.replace(/\/$/, "") + "/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
      catch { throw Object.assign(new Error("net"), { code: "net" }); }
      if (!r.ok) {
        const code = r.status === 429 ? "shared_quota" : "ai_error";
        if (r.status === 429) { let j = {}; try { j = await r.json(); } catch {} if (j.scope === "day") sharedOff = true; }
        throw Object.assign(new Error("HTTP " + r.status), { code });
      }
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      if (!text) throw Object.assign(new Error("empty"), { code: "ai_error" });
      sources = (Array.isArray(j.sources) ? j.sources : []).filter(x => x && typeof x.url === "string" && /^https:\/\//.test(x.url)).slice(0, 5).map(x => ({ title: String(x.title || "").slice(0, 140), url: x.url.slice(0, 400) }));
      return text;
    }
    const m = await pickModel();
    const r = await fetch(`${BASE}/models/${m}:generateContent?key=${encodeURIComponent(get(KEY))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const e = await fail(r);
      if (e.code === "no_model") set(MODEL, "");
      throw e;
    }
    const j = await r.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    if (!text) throw Object.assign(new Error("empty"), { code: "ai_error" });
    return text;
  }

  function parseJSON(text) {
    try { return JSON.parse(text); } catch {}
    const f = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (f) { try { return JSON.parse(f[1]); } catch {} }
    const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
    throw Object.assign(new Error("bad json"), { code: "ai_error" });
  }

  async function json(prompt) {
    const text = await generate({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.6 }
    });
    return parseJSON(text);
  }

  /* turns: [{role:"user"|"assistant", content}] */
  async function chat(system, turns, search) {
    return generate({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { temperature: 0.8, maxOutputTokens: 700 }
    }, search);
  }
  /* what is on in the city on the trip's dates, straight from a web search (shown, never stored) */
  async function events(city, month) {
    if (!SHARED) return null;
    const r = await fetch(SHARED.replace(/\/$/, "") + "/fresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "events", city, month }) });
    if (r.status === 503) return null;
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { code: r.status === 429 ? "shared_quota" : "ai_error" });
    const j = await r.json();
    return (Array.isArray(j.results) ? j.results : []).filter(x => x && typeof x.url === "string" && /^https:\/\//.test(x.url)).slice(0, 5)
      .map(x => ({ title: String(x.title || "").slice(0, 140), url: x.url.slice(0, 400), snippet: String(x.snippet || "").slice(0, 300) }));
  }

  async function saveKey(k) {
    k = (k || "").trim();
    // a Gemini key is letters, digits, "-" and "_" only: anything else is not a key (and is never stored)
    if (k && !/^[A-Za-z0-9_-]{20,80}$/.test(k)) throw Object.assign(new Error("bad key"), { code: "bad_key" });
    set(KEY, k);
    set(MODEL, "");
    if (!k) return null;
    try { return await pickModel(true); }
    catch (e) { if (e.code === "bad_key") set(KEY, ""); throw e; }
  }

  const errText = code => ({
    shared_quota: "המדריך החכם עמוס כרגע. נסו שוב בעוד כמה דקות, ובינתיים אפשר לשאול על הטיול עצמו.",
    quota: "הגעתם למגבלת השימוש החינמית של Gemini. נסו שוב בעוד דקה.",
    bad_key: "המפתח לא תקין. העתיקו אותו שוב מ-Google AI Studio.",
    no_model: "המודל לא זמין כרגע. נסו שוב, האתר יבחר מודל אחר.",
    ai_error: "המדריך החכם לא הצליח לענות. נסו שוב."
  })[code] || "המדריך החכם לא זמין כרגע. בדקו את החיבור לאינטרנט.";

  /* English descriptions into Hebrew: through our server, or with the traveler's own key */
  async function translate(texts) {
    if (shared()) {
      const r = await fetch(SHARED.replace(/\/$/, "") + "/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }) });
      if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { code: r.status === 429 ? "shared_quota" : "ai_error" });
      const j = await r.json();
      if (!Array.isArray(j.texts) || j.texts.length !== texts.length) throw Object.assign(new Error("bad"), { code: "ai_error" });
      return j.texts.map(x => String(x || "").slice(0, 3000));
    }
    const out = await json(`Translate each of these travel descriptions into natural, fluent Hebrew for Israeli travelers. Keep place names as commonly written. Answer with a JSON array of strings in the same order.\n${JSON.stringify(texts)}`);
    if (!Array.isArray(out) || out.length !== texts.length) throw Object.assign(new Error("bad"), { code: "ai_error" });
    return out.map(x => String(x || "").slice(0, 3000));
  }
  /* the wishes box in the traveler's own words: which named places they want, and which they have seen or do not want.
     Only places: everything else is understood on the device (intent.js), and shown back to them. */
  async function understand(text, city) {
    const body = {
      contents: [{ role: "user", parts: [{ text: `A traveler planning a trip to ${city} wrote this (usually in Hebrew):
"""${String(text).slice(0, 1500)}"""

List only specific named places in or near ${city} (not kinds of places like "museums" or "parks").
"want": places they ask to see, visit or eat at.
"skip": places they already visited or saw, or say they do not want.
When they refer to a group ("all of Gaudí's buildings", "the big museums"), list those specific places.
For each place give "name": its common English or local name (e.g. "Sagrada Família"), and "he": the Hebrew name they used, if any.
Never add a place they did not refer to. Answer JSON only: {"want":[{"name":"","he":""}],"skip":[{"name":"","he":""}]}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 600 }
    };
    const j = parseJSON(await generate(body));
    const list = a => (Array.isArray(a) ? a : []).slice(0, 10).map(x => ({ name: String(x?.name || "").replace(/[<>"`]/g, "").slice(0, 80).trim(), he: String(x?.he || "").replace(/[<>"`]/g, "").slice(0, 80).trim() })).filter(x => x.name || x.he);
    return { want: list(j?.want), skip: list(j?.skip) };
  }
  const hasSearch = () => !!SHARED;
  return { enabled, shared, own, model, json, chat, events, translate, understand, hasSearch, lastSources: () => sources, saveKey, errText };
})();
