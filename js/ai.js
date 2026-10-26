/* מסע · the smart guide through the Google Gemini API free tier.
   Open to everyone: when the site has a guide server (window.MASA_AI.proxy, a small Cloudflare Worker that keeps our
   key secret, see tools/ai-worker) every traveler gets the guide without doing anything.
   A traveler may still paste a key of their own; it stays in this browser only and goes straight to Google.
   Without either, the site works on open data and the guide answers from the trip itself. */
window.Masa = window.Masa || {};
Masa.ai = (() => {
  const BASE = "https://generativelanguage.googleapis.com/v1beta";
  const KEY = "masa-gemini-key", MODEL = "masa-gemini-model";
  const FALLBACK_MODEL = "gemini-2.5-flash";
  const get = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

  const testing = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && get("masa-ai-test") === "1";
  const SHARED = (window.MASA_AI && window.MASA_AI.proxy) || (testing ? location.origin + "/__ai" : "");
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

  async function generate(body) {
    if (shared()) {
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
  async function chat(system, turns) {
    return generate({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { temperature: 0.8, maxOutputTokens: 700 }
    });
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

  return { enabled, shared, own, model, json, chat, saveKey, errText };
})();
