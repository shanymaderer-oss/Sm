// The restaurants worth recommending in each ready city, chosen once by the smart guide (Gemini) from the city's own
// list of real restaurants (OpenStreetMap): the ones known to be good (in the Michelin Guide, on critics' lists, local
// institutions, consistently loved). It only picks from the list, never adds a place, and leaves out what it is unsure
// of. Saved as "picks" in data/cities/<slug>.json ({ "node/123": "fine" | "good" }); fetch-cities.mjs keeps them.
// Usage: GEMINI_KEY=… node tools/ai-picks.mjs [slug …]   (no slugs: every ready city without picks of this version)
// Run by .github/workflows/ai-picks.yml, which commits each city as it is done.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { CITIES } = require("../js/cities.js");
const PICKS_V = 1;
const KEY = process.env.GEMINI_KEY;
if (!KEY) { console.error("GEMINI_KEY is not set"); process.exit(1); }
const MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHAIN = /mcdonald|burger king|kfc|subway|starbucks|domino|pizza hut|telepizza|vips|five guys|wendy|taco bell|100 montaditos|goiko|udon|wok to walk|popeyes|tim hortons|costa coffee|pret a manger|nando/i;

const SYSTEM = `You are a restaurant critic who knows the food scene of the world's big cities well.
You get a numbered list of REAL restaurants in one city (name, cuisine, street). Return ONLY those you are confident are
genuinely well regarded: listed in the Michelin Guide (stars, Bib Gourmand or selected), on respected critics' or
newspaper "best of" lists, famous historic institutions, or places locals and food writers consistently call excellent.
tier "fine": upscale, destination or fine dining. tier "good": excellent casual, traditional or local favourite.
Rules: pick only from the list, by its number. If you are not sure about a place, leave it out. Most of the list should
be left out; ordinary neighbourhood places, chains and tourist traps are never picked.`;
const SCHEMA = { type: "object", properties: { picks: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, tier: { type: "string", enum: ["fine", "good"] } }, required: ["i", "tier"] } } }, required: ["picks"] };

async function ask(city, items) {
  const user = `City: ${city}\n` + items.map((x, i) => `${i}. ${x.name}${x.cuisine ? ` | ${x.cuisine}` : ""}${x.street ? ` | ${x.street}` : ""}`).join("\n");
  for (const m of MODELS) for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(KEY)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA } })
      });
      if (r.status === 429 || r.status >= 500) { await sleep(8000 * (a + 1)); continue; }
      if (!r.ok) break; // this model is not available: the next one
      const j = await r.json();
      const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      const out = JSON.parse(txt).picks || [];
      return out.filter(p => Number.isInteger(p.i) && p.i >= 0 && p.i < items.length && (p.tier === "fine" || p.tier === "good"));
    } catch { await sleep(4000); }
  }
  throw new Error("no answer");
}

async function city(c) {
  const path = `data/cities/${c.slug}.json`;
  if (!existsSync(path)) return null;
  const d = JSON.parse(readFileSync(path, "utf8"));
  const list = (d.els || []).filter(e => e.tags?.amenity === "restaurant" && e.tags.name && !e.tags.brand && !CHAIN.test(e.tags.name))
    .map(e => ({ id: `${e.type}/${e.id}`, name: e.tags["name:en"] && e.tags["name:en"] !== e.tags.name ? `${e.tags.name} (${e.tags["name:en"]})` : e.tags.name, cuisine: (e.tags.cuisine || "").replace(/;/g, ", ").slice(0, 40), street: (e.tags["addr:street"] || "").slice(0, 40) }));
  if (list.length < 5) return { picks: {}, n: list.length };
  const picks = {};
  for (let s = 0; s < list.length; s += 120) {
    const chunk = list.slice(s, s + 120);
    const got = await ask(`${c.en || c.slug} (${(c.cc || "").toUpperCase()})`, chunk);
    for (const p of got) picks[chunk[p.i].id] = p.tier;
    await sleep(4500); // the free tier allows about 15 requests a minute
  }
  // re-read before writing: the city refresh may have written this file meanwhile
  const now = JSON.parse(readFileSync(path, "utf8"));
  now.picks = picks; now.picksV = PICKS_V;
  writeFileSync(path, JSON.stringify(now));
  return { picks, n: list.length };
}

const want = process.argv.slice(2);
const todo = CITIES.filter(c => want.length ? want.includes(c.slug) : (() => { try { return JSON.parse(readFileSync(`data/cities/${c.slug}.json`, "utf8")).picksV !== PICKS_V; } catch { return false; } })());
console.log(`cities: ${todo.length}`);
for (const c of todo) {
  try {
    const r = await city(c);
    if (!r) continue;
    const fine = Object.values(r.picks).filter(t => t === "fine").length, good = Object.values(r.picks).length - fine;
    console.log(`${c.slug}: ${r.n} restaurants → ${fine} fine, ${good} good`);
    if (process.env.COMMIT_EACH) {
      execSync(`git add data/cities/${c.slug}.json && git commit -qm "בחירת מסעדות: ${c.slug}" || true`, { stdio: "inherit" });
      for (let a = 0; a < 5; a++) { try { execSync("git pull -q --rebase && git push -q", { stdio: "inherit" }); break; } catch { await sleep(5000 * (a + 1)); } }
    }
  } catch (e) { console.log(`${c.slug}: failed (${e.message})`); }
}
