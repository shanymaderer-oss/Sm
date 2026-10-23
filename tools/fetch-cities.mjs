// Fetches map data for the popular cities and saves it as data/cities/<slug>.json.
// Runs on GitHub Actions (free). Usage: node tools/fetch-cities.mjs [slug ...]
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const S = require("../js/sources.js");
const { CITIES } = require("../js/cities.js");
const UA = { "User-Agent": "MasaTripPrototype/0.1 (github.com/shanymaderer-oss/Sm)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, opts = {}, ms = 60000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function overpass(q) {
  for (let round = 0; round < 2; round++) for (const ep of S.OVERPASS) {
    try {
      const j = await getJSON(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) }, 90000);
      if (Array.isArray(j.elements) && (j.elements.length || !j.remark)) return j.elements;
      console.log("  overpass remark", ep, j.remark);
    } catch (e) { console.log("  overpass fail", ep, e.message); }
    await sleep(3000);
  }
  return [];
}
async function voyage(title) {
  const get = async t => {
    try { const j = await getJSON(`https://en.wikivoyage.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=wikitext&formatversion=2&format=json&redirects=1`); return j.parse?.wikitext || ""; }
    catch (e) { console.log("  voyage fail", t, e.message); return ""; }
  };
  const main = await get(title);
  let list = S.parseVoyage(main);
  const districts = S.voyageDistricts(main, title);
  for (const d of districts) { list = list.concat(S.parseVoyage(await get(d)).map(x => ({ ...x, district: d.split("/").pop() }))); await sleep(300); }
  return { list, districts };
}
async function wikiGeo(lang, lat, lng, r) {
  try {
    const j = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&gslimit=100&gsradius=${Math.min(10000, r)}&gscoord=${lat}|${lng}`);
    return (j.query?.geosearch || []).map(g => ({ title: g.title, lat: g.lat, lng: g.lon, pageid: g.pageid, lang }));
  } catch { return []; }
}

const only = process.argv.slice(2);
mkdirSync("data/cities", { recursive: true });
const summary = [];
for (const c of CITIES.filter(c => !only.length || only.includes(c.slug))) {
  console.log("==", c.slug);
  const q = S.buildQueries(c.lat, c.lng, c.R);
  const els = [];
  for (const [k, v] of Object.entries(q)) { const e = await overpass(v); console.log("  ", k, e.length); els.push(...e); await sleep(2500); }
  const v = await voyage(c.en);
  const wiki = { he: await wikiGeo("he", c.lat, c.lng, c.R * 1.2), en: await wikiGeo("en", c.lat, c.lng, c.R * 1.2) };
  const data = { city: c, fetchedAt: new Date().toISOString(), els: S.slim(els), voyage: v.list, wiki };
  writeFileSync(`data/cities/${c.slug}.json`, JSON.stringify(data));
  const eat = v.list.filter(x => x.type === "eat");
  summary.push(`${c.slug}: osm ${data.els.length}, voyage ${v.list.length} (eat ${eat.length}, with coords ${eat.filter(x => x.lat).length}, districts ${v.districts.length}), wiki he ${wiki.he.length} en ${wiki.en.length}`);
}
console.log("\n" + summary.join("\n"));
