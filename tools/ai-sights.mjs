// The sights of each ready city, graded once by the smart guide (Gemini) from the city's own list of real places
// (OpenStreetMap): what a first visit must not miss, what is worth it with time, what to skip, how long a visit takes and
// one practical tip in Hebrew. It only grades places on the list, never adds one, and leaves out what it is unsure
// of. Saved in data/sights/<slug>.json ({ v, at, s: { "way/123": ["must" | "good" | "skip", minutes, "tip"] } }), apart
// from the city data so the daily city refresh never touches them; the planner reads both.
// Usage: GEMINI_KEY=… node tools/ai-sights.mjs [slug …]   (no slugs: every ready city without grades of this version)
// Run by .github/workflows/ai-sights.yml, which commits each city as it is done.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { CITIES } = require("../js/cities.js");
const PICKS_V = 1;
const KEY = process.env.GEMINI_KEY;
if (!KEY) { console.error("GEMINI_KEY is not set"); process.exit(1); }
const MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MINOR = /^(memorial|wayside_shrine|wayside_cross|boundary_stone|milestone|stone|marker|tomb|grave)$/;
const isSight = t => ["museum", "attraction", "gallery", "viewpoint", "zoo", "aquarium", "theme_park", "artwork"].includes(t.tourism) && t.tourism !== "artwork"
  || (t.historic && !MINOR.test(t.historic)) || t.amenity === "place_of_worship" || ["park", "garden", "nature_reserve"].includes(t.leisure)
  || ["tower", "bridge", "lighthouse"].includes(t.man_made) || t.place === "square" || t.natural === "beach" || t.amenity === "marketplace";

const SYSTEM = `You are an experienced tour guide who knows the city's sights well.
You get a numbered list of REAL places in one city (name, kind). Grade only those you know:
tier "must": a highlight a first-time visitor should not miss. "good": worth it with time or for a special interest.
"skip": not worth a tourist's time (minor, closed, disappointing, only a facade, a tourist trap).
min: a typical visit in minutes (inside included, 10 to 240). tip: ONE short practical tip in Hebrew (up to 90 characters),
like booking ahead, the best hour, a dress code, the best view, or a free day; empty if there is nothing useful.
Rules: grade only from the list, by its number. If you do not know a place, leave it out. Be strict with "must".`;
const SCHEMA = { type: "object", properties: { g: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, tier: { type: "string", enum: ["must", "good", "skip"] }, min: { type: "integer" }, tip: { type: "string" } }, required: ["i", "tier", "min"] } } }, required: ["g"] };

async function ask(city, items) {
  const user = `City: ${city}\n` + items.map((x, i) => `${i}. ${x.name} | ${x.kind}`).join("\n");
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
      const out = JSON.parse(txt).g || [];
      return out.filter(p => Number.isInteger(p.i) && p.i >= 0 && p.i < items.length && ["must", "good", "skip"].includes(p.tier));
    } catch { await sleep(4000); }
  }
  throw new Error("no answer");
}

async function city(c) {
  const path = `data/cities/${c.slug}.json`;
  if (!existsSync(path)) return null;
  const d = JSON.parse(readFileSync(path, "utf8"));
  const F = d.fame?.n || {};
  const kindOf = t => t.tourism || t.historic && `historic ${t.historic}` || (t.amenity === "place_of_worship" ? `place of worship${t.religion ? " " + t.religion : ""}` : "") || t.leisure || t.man_made || (t.place === "square" ? "square" : "") || t.natural || t.amenity || "";
  const seen = new Set();
  const list = (d.els || []).filter(e => e.tags?.name && isSight(e.tags) && (e.tags.wikidata || e.tags.wikipedia || F[e.tags.wikidata] || e.tags.tourism))
    .map(e => ({ id: `${e.type}/${e.id}`, name: e.tags["name:en"] && e.tags["name:en"] !== e.tags.name ? `${e.tags.name} (${e.tags["name:en"]})` : e.tags.name, kind: kindOf(e.tags).slice(0, 40), fame: F[e.tags.wikidata] || 0 }))
    .filter(x => !seen.has(x.name) && seen.add(x.name)).sort((a, b) => b.fame - a.fame).slice(0, 320);
  if (list.length < 5) return { s: {}, n: list.length };
  const out = {};
  for (let s = 0; s < list.length; s += 160) {
    const chunk = list.slice(s, s + 160);
    const got = await ask(`${c.en || c.slug} (${(c.cc || "").toUpperCase()})`, chunk);
    for (const p of got) out[chunk[p.i].id] = [p.tier, Math.max(10, Math.min(240, p.min | 0 || 60)), String(p.tip || "").replace(/[<>]/g, "").slice(0, 110)];
    await sleep(4500);
  }
  mkdirSync("data/sights", { recursive: true });
  writeFileSync(`data/sights/${c.slug}.json`, JSON.stringify({ v: PICKS_V, at: new Date().toISOString().slice(0, 10), s: out }));
  return { s: out, n: list.length };
}

const want = process.argv.slice(2);
const done = slug => { try { return JSON.parse(readFileSync(`data/sights/${slug}.json`, "utf8")).v === PICKS_V; } catch { return false; } };
const todo = CITIES.filter(c => existsSync(`data/cities/${c.slug}.json`) && (want.length ? want.includes(c.slug) : !done(c.slug)));
console.log(`cities: ${todo.length}`);
for (const c of todo) {
  try {
    const r = await city(c);
    if (!r) continue;
    const v = Object.values(r.s), n = k => v.filter(x => x[0] === k).length;
    console.log(`${c.slug}: ${r.n} sights → ${n("must")} must, ${n("good")} good, ${n("skip")} skip`);
    if (process.env.COMMIT_EACH) {
      execSync(`git add data/sights/${c.slug}.json && git commit -qm "דירוג אטרקציות: ${c.slug}" || true`, { stdio: "inherit" });
      // only our own file changes, so a rebase on the city refresh's commits never conflicts
      for (let a = 0; a < 5; a++) { try { execSync("git pull -q --rebase && git push -q", { stdio: "inherit" }); break; } catch { try { execSync("git rebase --abort", { stdio: "ignore" }); } catch {} await sleep(5000 * (a + 1)); } }
    }
  } catch (e) { console.log(`${c.slug}: failed (${e.message})`); }
}
