// node tools/ai-worker/test_worker.mjs — the Worker's rules, with Google mocked
import w from "./worker.js";
const env = { GEMINI_KEY: "k" }; let sent = [], fails = [];
const ok = (c, what) => { console.log((c ? "PASS " : "FAIL ") + what); if (!c) fails.push(what); };
let upstream = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "שלום" }] } }], usageMetadata: { secret: 1 } }), { status: 200 });
globalThis.fetch = async (u, o) => { sent.push({ u, o }); return upstream(u, o); };
const O = "https://shanymaderer-oss.github.io";
const call = (body, { origin = O, ip = "1.1.1.1", path = "/generate", method = "POST" } = {}) =>
  w.fetch(new Request("https://x.workers.dev" + path, { method, headers: { Origin: origin, "CF-Connecting-IP": ip, "Content-Type": "application/json" }, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined }), env);
const good = { systemInstruction: { parts: [{ text: "sys" }] }, contents: [{ role: "user", parts: [{ text: "מה הבא?" }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 700 } };
let r = await call(good); let j = await r.json();
ok(r.status === 200 && j.candidates[0].content.parts[0].text === "שלום" && !j.usageMetadata, "answers, and only the answer goes back");
ok(r.headers.get("Access-Control-Allow-Origin") === O, "our site is allowed (CORS)");
ok(sent[0].o.headers["x-goog-api-key"] === "k" && !sent[0].u.includes("key="), "the key goes in a header, never in the address");
r = await call(good, { origin: "https://evil.example" }); ok(r.status === 403 && !r.headers.get("Access-Control-Allow-Origin"), "another site is refused");
r = await call(good, { method: "GET" }); ok(r.status === 404, "GET is refused");
r = await call(good, { path: "/v1beta/models" }); ok(r.status === 404, "other paths are refused");
sent = []; r = await call({ ...good, tools: [{ googleSearch: {} }], safetySettings: [], cachedContent: "x", generationConfig: { maxOutputTokens: 100000, temperature: 9 } }, { ip: "2" });
const b = JSON.parse(sent[0].o.body);
ok(!b.tools && !b.safetySettings && !b.cachedContent && b.generationConfig.maxOutputTokens === 1024 && b.generationConfig.temperature === 1, "extra fields are dropped and limits enforced");
r = await call("x".repeat(30000), { ip: "3" }); ok(r.status === 413, "a huge request is refused");
r = await call("{bad", { ip: "4" }); ok(r.status === 400, "broken JSON is refused");
r = await call({ contents: [{ role: "model", parts: [{ text: "hi" }] }] }, { ip: "5" }); ok(r.status === 400, "must end with the traveler's question");
let codes = []; for (let i = 0; i < 14; i++) codes.push((await call(good, { ip: "9.9.9.9" })).status);
ok(codes.slice(0, 12).every(c => c === 200) && codes[12] === 429, "one address is limited per minute");
upstream = () => new Response("{}", { status: 404 }); sent = [];
r = await call(good, { ip: "6" }); ok(sent.length === 2 && r.status === 502, "a missing model falls back to the next one");
upstream = () => new Response(JSON.stringify({ error: { message: "Quota exceeded for metric: generate_content_free_tier_requests, limit per day" } }), { status: 429 });
r = await call(good, { ip: "7" }); j = await r.json(); ok(r.status === 429 && j.scope === "day", "Google's daily quota is reported as such");
r = await w.fetch(new Request("https://x/generate", { method: "POST", headers: { Origin: O }, body: "{}" }), {}); ok(r.status === 503, "without a key it says it is not set up");
// fresh information through Tavily
const envT = { GEMINI_KEY: "k", TAVILY_KEY: "tv" };
const tcall = (body, ip, path = "/generate") => w.fetch(new Request("https://x.workers.dev" + path, { method: "POST", headers: { Origin: O, "CF-Connecting-IP": ip, "Content-Type": "application/json" }, body: JSON.stringify(body) }), envT);
let tq = [];
upstream = (u, o) => {
  if (String(u).includes("tavily")) { tq.push(JSON.parse(o.body)); return new Response(JSON.stringify({ results: [{ title: "Vatican Museums hours", url: "https://www.museivaticani.va/hours", content: "Closed on 25 December", raw_content: "x".repeat(9000) }, { title: "bad", url: "javascript:alert(1)", content: "x" }] }), { status: 200 }); }
  const b = JSON.parse(o.body);
  if (!b.systemInstruction) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Vatican Museums opening hours Christmas 2026" }] } }] }), { status: 200 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: b.systemInstruction.parts[0].text.includes("Closed on 25 December") ? "סגור ב-25 בדצמבר" : "לא יודע" }] } }] }), { status: 200 });
};
r = await tcall({ ...good, search: { q: "הוותיקן פתוח בחג המולד?", city: "Rome" } }, "t1"); j = await r.json();
ok(r.status === 200 && j.candidates[0].content.parts[0].text === "סגור ב-25 בדצמבר", "a question about now is answered from fresh search results");
ok(tq.length === 1 && /Vatican/.test(tq[0].query) && tq[0].max_results === 5, "the search query is rewritten in English and limited");
ok(j.sources.length === 1 && j.sources[0].url.startsWith("https://") && !JSON.stringify(j).includes("raw_content"), "only https sources come back, as title and link");
tq = []; r = await tcall(good, "t2"); ok(tq.length === 0, "an ordinary question does not search");
r = await tcall({ ...good, search: { q: "x", city: "Rome" } }, "t3"); ok(tq.length === 1, "search allowed");
let n = 0; for (let i = 0; i < 10; i++) { tq = []; await tcall({ ...good, search: { q: "x", city: "Rome" } }, "t4"); n += tq.length; }
ok(n === 8, `one address gets at most 8 searches a day (${n})`);
tq = []; r = await tcall({ kind: "events", city: "Rome<script>", month: "December 2026" }, "t5", "/fresh"); j = await r.json();
ok(r.status === 200 && j.results.length === 1 && j.via === "Tavily" && /^Rome.*events.*December 2026/.test(tq[0].query) && !tq[0].query.includes("<"), "events in the city come straight from the search, cleaned");
r = await tcall({ kind: "anything", city: "Rome" }, "t6", "/fresh"); ok(r.status === 400, "only the events search is offered");
r = await w.fetch(new Request("https://x/fresh", { method: "POST", headers: { Origin: O }, body: JSON.stringify({ kind: "events", city: "Rome" }) }), { GEMINI_KEY: "k" }); ok(r.status === 503, "without a Tavily key, events search says so");
// translation
upstream = (u, o) => { const b = JSON.parse(o.body); const arr = JSON.parse(b.contents[0].parts[0].text.split("\n").slice(1).join("\n")); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(arr.map(x => "עב: " + x)) }] } }] }), { status: 200 }); };
r = await tcall({ texts: ["Great views", "x".repeat(5000), 7] }, "tr1", "/translate"); j = await r.json();
ok(r.status === 200 && j.texts.length === 2 && j.texts[0] === "עב: Great views" && j.texts[1].length <= 3000, "texts are translated in order, long ones cut");
r = await tcall({ texts: [] }, "tr2", "/translate"); ok(r.status === 400, "nothing to translate is refused");
console.log(fails.length ? "FAILED: " + fails : "ALL PASSED"); process.exit(fails.length ? 1 : 0);
