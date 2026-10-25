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
      // a "runtime error" remark (timeout, out of memory) means the answer was cut off: ask again rather than keep a partial list
      const cut = /runtime error|timed out|out of memory/i.test(j.remark || "");
      if (Array.isArray(j.elements) && !cut && (j.elements.length || !j.remark)) { log.push(`${new URL(ep).host} ok ${j.elements.length} ${Date.now() - t0}ms`); return j.elements; }
      log.push(`${new URL(ep).host} remark ${String(j.remark).slice(0, 80)}`);
    } catch (e) { log.push(`${new URL(ep).host} ${e.name === "AbortError" ? "timeout" : e.message} ${Date.now() - t0}ms`); }
    await sleep(10000 * (i + 1));
  }
  return null; // every server failed: not the same as "nothing there"
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
  const subs = [];
  parts.forEach((wt, i) => {
    const items = S.parseVoyage(wt);
    list = list.concat(items.map(x => ({ ...x, district: districts[i].split("/").pop() })));
    // huge cities: districts that are only a list of smaller districts
    if (items.length < 8) subs.push(...S.voyageDistricts(wt, districts[i]).slice(0, 4));
  });
  const subParts = await Promise.all(subs.slice(0, 12).map(get));
  subParts.forEach((wt, i) => { list = list.concat(S.parseVoyage(wt).map(x => ({ ...x, district: subs[i].split("/").pop() }))); });
  return { list, districts: [...districts, ...subs.slice(0, 12)] };
}
async function wikiGeo(lang, lat, lng, r) {
  try {
    const j = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&gslimit=100&gsradius=${Math.min(10000, r)}&gscoord=${lat}|${lng}`, {}, 20000);
    return (j.query?.geosearch || []).map(g => ({ title: g.title, lat: g.lat, lng: g.lon, pageid: g.pageid, lang }));
  } catch { return []; }
}
function commit(msg) {
  if (!COMMIT) return;
  msg = String(msg).replace(/[^\p{L}\p{N} :._-]/gu, "");
  try {
    execSync(`git add data/cities && (git diff --cached --quiet || (git commit -q -m "${msg}" && (git push -q || (git pull -q --rebase && git push -q))))`, { stdio: "inherit", shell: "/bin/bash" });
  } catch (e) { console.log("commit failed", e.message); }
}

const only = process.argv.slice(2);
mkdirSync("data/cities", { recursive: true });
const statusPath = "data/cities/_status.json";
const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, "utf8")) : {};
const FAME_V = 3;
// a query whose text changed gets fetched again: raise its number here
const QUERY_V = { sights: 2 }; // bump to fetch how famous each sight is again
async function getFame(els, log, voyage) {
  const ids = S.fameIds(els, 1200, voyage);
  const out = { n: {}, he: {} };
  for (let i = 0; i < ids.length; i += 50) {
    // Wikidata answers 429 when asked too fast: wait longer and ask again
    for (let k = 0; k < 5; k++) {
      try { S.fameParse(await getJSON(S.fameUrl(ids.slice(i, i + 50)), {}, 30000), out); break; }
      catch (e) { log.push(`wikidata ${e.message}`); await sleep(5000 * (k + 1)); }
    }
    await sleep(1500);
  }
  log.push(`fame: ${Object.keys(out.n).length} of ${ids.length}`);
  return out;
}
const STREETS_V = 2; // bump to fetch the shopping streets again everywhere (bigger area, better ranking)
const OPTIONAL = ["diet"]; // there can honestly be no kosher places; streets are asked again until found (cheap, one query)
async function doCity(c) {
  const t0 = Date.now();
  const log = [];
  const q = S.buildQueries(c.lat, c.lng, c.R);
  const path = `data/cities/${c.slug}.json`;
  const st0 = status[c.slug];
  // recent data that only misses a few queries (for example a new kind of query): fetch just those and keep the rest
  const prev = !FORCE && st0 && existsSync(path) && (Date.now() - Date.parse(st0.at)) / 864e5 < 6 ? JSON.parse(readFileSync(path, "utf8")) : null;
  const need = Object.keys(q).filter(k => !prev || !(k in (st0.osm || {})) || (st0.osm[k] === 0 && !OPTIONAL.includes(k)) || (k === "streets" && st0.streetsV !== STREETS_V) || ((st0.qv?.[k] || 1) < (QUERY_V[k] || 1)));
  const els = [], counts = { ...(prev ? st0.osm : {}) };
  let streets = prev?.streets || [];
  for (const k of need) {
    const e = await overpass(q[k], log);
    if (k === "streets") { if (e) { streets = S.shopStreets(e); counts[k] = streets.length; log.push(`streets: ${e.length} shops`); } else delete counts[k]; }
    else { counts[k] = e ? e.length : 0; els.push(...(e || [])); }
    await sleep(8000);
  }
  let v, he, en;
  if (prev) { v = { list: prev.voyage, districts: [] }; ({ he, en } = prev.wiki); }
  else [v, he, en] = await Promise.all([voyage(c.en), wikiGeo("he", c.lat, c.lng, c.R * 1.2), wikiGeo("en", c.lat, c.lng, c.R * 1.2)]);
  const allEls = [...(prev?.els || []), ...S.slim(els)];
  const fame = prev?.fame && st0?.fameV === FAME_V && !els.length ? prev.fame : await getFame(allEls, log, prev?.voyage || []);
  const data = { city: c, fetchedAt: prev ? prev.fetchedAt : new Date().toISOString(), els: allEls, streets, fame, voyage: v.list, wiki: { he, en } };
  const by = t => v.list.filter(x => x.type === t).length;
  status[c.slug] = { at: data.fetchedAt, seconds: Math.round((Date.now() - t0) / 1000) + (prev ? st0.seconds || 0 : 0), osm: counts,
    voyage: prev ? st0.voyage : { eat: by("eat"), drink: by("drink"), buy: by("buy"), see: by("see"), sleep: by("sleep"), withCoords: v.list.filter(x => x.lat).length, districts: v.districts.length },
    wiki: { he: he.length, en: en.length }, streetsV: "streets" in counts ? STREETS_V : (st0?.streetsV || 0), fameV: Object.keys(fame.n).length ? FAME_V : 0, qv: { ...(st0?.qv || {}), ...Object.fromEntries(need.filter(k => counts[k] > 0).map(k => [k, QUERY_V[k] || 1])) }, streets: streets.slice(0, 5).map(x => `${x.name} (${x.n})`), log: [...(prev ? ["(updated: " + need.join(", ") + ")"] : []), ...log] };
  if (data.els.length || v.list.length) writeFileSync(path, JSON.stringify(data));
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
  return ageDays < 6 && st.streetsV === STREETS_V && st.fameV === FAME_V && Object.entries(QUERY_V).every(([k, v]) => (st.qv?.[k] || 1) >= v) && keys.every(k => OPTIONAL.includes(k) ? k in (st.osm || {}) : (st.osm || {})[k] > 0);
};
for (const c of list) {
  if (!FORCE && fresh(c)) { console.log(c.slug, "fresh, skipped"); continue; }
  await doCity(c);
  commit(`נתוני עיר: ${c.slug}`);
  await sleep(3000);
}
