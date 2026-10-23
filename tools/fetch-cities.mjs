// Fetches map data for the popular cities and saves it as data/cities/<slug>.json.
// Runs on GitHub Actions (free). Usage: node tools/fetch-cities.mjs [slug ...]
// Each city is committed as soon as it is ready, so a slow server never loses the work already done.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const S = require("../js/sources.js");
const { CITIES } = require("../js/cities.js");
const UA = { "User-Agent": "MasaTripPrototype/0.2 (github.com/shanymaderer-oss/Sm)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COMMIT = process.env.COMMIT_EACH === "1";

async function getJSON(url, opts = {}, ms = 40000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function overpass(q, log) {
  // the main server answers best when asked one query at a time; on "busy" (429/502/504) wait and ask again
  const order = [S.OVERPASS[0], S.OVERPASS[0], S.OVERPASS[0], S.OVERPASS[1], S.OVERPASS[2]];
  for (let i = 0; i < order.length; i++) {
    const ep = order[i], t0 = Date.now();
    try {
      const j = await getJSON(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) }, 60000);
      if (Array.isArray(j.elements) && (j.elements.length || !j.remark)) { log.push(`${new URL(ep).host} ok ${j.elements.length} ${Date.now() - t0}ms`); return j.elements; }
      log.push(`${new URL(ep).host} remark ${String(j.remark).slice(0, 80)}`);
    } catch (e) { log.push(`${new URL(ep).host} ${e.name === "AbortError" ? "timeout" : e.message} ${Date.now() - t0}ms`); }
    await sleep(10000 * (i + 1));
  }
  return [];
}
async function voyage(title) {
  const get = async t => {
    try { const j = await getJSON(`https://en.wikivoyage.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=wikitext&formatversion=2&format=json&redirects=1`, {}, 20000); return j.parse?.wikitext || ""; }
    catch { return ""; }
  };
  const main = await get(title);
  let list = S.parseVoyage(main);
  const districts = S.voyageDistricts(main, title).slice(0, 8);
  const parts = await Promise.all(districts.map(get));
  parts.forEach((wt, i) => { list = list.concat(S.parseVoyage(wt).map(x => ({ ...x, district: districts[i].split("/").pop() }))); });
  return { list, districts };
}
async function wikiGeo(lang, lat, lng, r) {
  try {
    const j = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&gslimit=100&gsradius=${Math.min(10000, r)}&gscoord=${lat}|${lng}`, {}, 20000);
    return (j.query?.geosearch || []).map(g => ({ title: g.title, lat: g.lat, lng: g.lon, pageid: g.pageid, lang }));
  } catch { return []; }
}
function commit(msg) {
  if (!COMMIT) return;
  try {
    execSync(`git add data/cities && (git diff --cached --quiet || (git commit -q -m "${msg}" && (git push -q || (git pull -q --rebase && git push -q))))`, { stdio: "inherit", shell: "/bin/bash" });
  } catch (e) { console.log("commit failed", e.message); }
}

const only = process.argv.slice(2);
mkdirSync("data/cities", { recursive: true });
const statusPath = "data/cities/_status.json";
const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, "utf8")) : {};
async function doCity(c) {
  const t0 = Date.now();
  const log = [];
  const q = S.buildQueries(c.lat, c.lng, c.R);
  const els = [], counts = {};
  for (const [k, v] of Object.entries(q)) { const e = await overpass(v, log); counts[k] = e.length; els.push(...e); await sleep(8000); }
  const [v, he, en] = await Promise.all([voyage(c.en), wikiGeo("he", c.lat, c.lng, c.R * 1.2), wikiGeo("en", c.lat, c.lng, c.R * 1.2)]);
  const data = { city: c, fetchedAt: new Date().toISOString(), els: S.slim(els), voyage: v.list, wiki: { he, en } };
  const by = t => v.list.filter(x => x.type === t).length;
  status[c.slug] = { at: data.fetchedAt, seconds: Math.round((Date.now() - t0) / 1000), osm: counts, voyage: { eat: by("eat"), drink: by("drink"), buy: by("buy"), see: by("see"), sleep: by("sleep"), withCoords: v.list.filter(x => x.lat).length, districts: v.districts.length }, wiki: { he: he.length, en: en.length }, log };
  if (data.els.length || v.list.length) writeFileSync(`data/cities/${c.slug}.json`, JSON.stringify(data));
  writeFileSync(statusPath, JSON.stringify(status, null, 1));
  console.log(c.slug, JSON.stringify(status[c.slug]));
}
const list = CITIES.filter(c => !only.length || only.includes(c.slug));
const FORCE = process.env.FORCE === "1" || only.length > 0;
const fresh = c => {
  const st = status[c.slug];
  if (!st || !existsSync(`data/cities/${c.slug}.json`)) return false;
  const ageDays = (Date.now() - Date.parse(st.at)) / 864e5;
  const keys = Object.keys(S.buildQueries(c.lat, c.lng, c.R));
  return ageDays < 6 && keys.every(k => (st.osm || {})[k] > 0);
};
for (const c of list) {
  if (!FORCE && fresh(c)) { console.log(c.slug, "fresh, skipped"); continue; }
  await doCity(c);
  commit(`נתוני עיר: ${c.slug}`);
  await sleep(3000);
}
