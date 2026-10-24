/* מסע · free data services: Nominatim (search), Overpass (OpenStreetMap places),
   Wikidata + Wikipedia (names, history, photos), OSRM by FOSSGIS (walking routes).
   All are free and need no key. Please keep request volume low and respect their usage policies. */
window.Masa = window.Masa || {};
Masa.svc = (() => {
  async function getJSON(url, opts = {}, timeout = 25000, signal) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
      return await r.json();
    } finally {
      clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async function mapLimit(arr, n, fn) {
    const res = new Array(arr.length);
    let i = 0;
    const worker = async () => {
      while (i < arr.length) {
        const k = i++;
        try { res[k] = await fn(arr[k], k); } catch { res[k] = null; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, arr.length) }, worker));
    return res;
  }

  /* Destination search. Hebrew names where they exist, plus the local name for map searches. */
  async function geocode(q, signal) {
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&namedetails=1&accept-language=he&q=${encodeURIComponent(q)}`;
    const r = await getJSON(u, {}, 20000, signal);
    if (!r.length) return null;
    const x = r[0], nd = x.namedetails || {};
    const bb = (x.boundingbox || []).map(Number);
    return {
      lat: +x.lat, lng: +x.lon,
      name: nd["name:he"] || x.name || q.split(",")[0].trim(),
      local: nd.name || x.name || q,
      en: nd["name:en"] || null,
      country: x.address?.country || "",
      cc: (x.address?.country_code || "").toLowerCase(),
      bbox: bb.length === 4 ? { s: bb[0], n: bb[1], w: bb[2], e: bb[3] } : null
    };
  }

  const OVERPASS = Masa.sources.OVERPASS;
  /* the main server answers "busy" (429/502/504) in a fraction of a second when full; a short wait and a retry usually works */
  async function overpassOnce(ep, query, signal) {
    for (let i = 0; ; i++) {
      try { return await overpassTry(ep, query, signal); }
      catch (e) {
        if (signal?.aborted || i >= 3 || ![429, 502, 503, 504].includes(e.status)) throw e;
        await new Promise(r => setTimeout(r, 1500 * (i + 1) + Math.random() * 800));
      }
    }
  }
  async function overpassTry(ep, query, signal) {
    const j = await getJSON(ep, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query)
    }, 30000, signal);
    if (!j || !Array.isArray(j.elements)) throw new Error("bad overpass answer");
    if (!j.elements.length && j.remark) throw new Error("overpass busy: " + j.remark);
    return j;
  }
  /* Start on one mirror; if it has not answered after a few seconds, also ask the next one.
     The first good answer wins and the others are cancelled. */
  function overpass(query, signal, start = 0) {
    const order = [...OVERPASS.slice(start), ...OVERPASS.slice(0, start)];
    const ctls = [];
    let launched = 0, failed = 0, done = false;
    return new Promise((resolve, reject) => {
      const finish = (ok, v) => { if (done) return; done = true; timers.forEach(clearTimeout); ctls.forEach(c => c.abort()); ok ? resolve(v) : reject(v); };
      const launch = () => {
        if (done || launched >= order.length) return;
        const c = new AbortController(); ctls.push(c);
        overpassOnce(order[launched++], query, c.signal)
          .then(j => finish(true, j))
          .catch(() => { failed++; if (failed >= order.length) finish(false, new Error("overpass unavailable")); else launch(); });
      };
      const timers = [setTimeout(launch, 10000), setTimeout(launch, 18000)];
      signal?.addEventListener("abort", () => finish(false, new Error("aborted")));
      launch();
    });
  }

  /* Weather forecast for up to 16 days (Open-Meteo, free, no key) */
  async function weather(lat, lng) {
    try {
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`, {}, 12000);
      const d = j.daily || {};
      return (d.time || []).map((t, i) => ({ date: t, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max?.[i], code: d.weather_code?.[i] }));
    } catch { return null; }
  }
  /* exchange rate to shekels, from the European Central Bank via Frankfurter (free, no key) */
  async function rateToILS(cur) {
    if (!cur || cur === "ILS") return 1;
    try {
      const j = await getJSON(`https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=ILS`, {}, 10000);
      if (j.rates?.ILS) return { rate: j.rates.ILS, date: j.date, src: "הבנק המרכזי האירופי" };
    } catch {}
    try {
      const j = await getJSON(`https://open.er-api.com/v6/latest/${cur}`, {}, 10000);
      if (j.rates?.ILS) return { rate: j.rates.ILS, date: (j.time_last_update_utc || "").slice(5, 16), src: "ExchangeRate-API" };
    } catch {}
    return null;
  }

  /* Wikivoyage recommendations for a city, including its district pages */
  async function voyage(title, signal) {
    if (!title) return [];
    const get = async t => {
      try {
        const j = await getJSON(`https://en.wikivoyage.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=wikitext&formatversion=2&format=json&redirects=1&origin=*`, {}, 15000, signal);
        return j.parse?.wikitext || "";
      } catch { return ""; }
    };
    const S = Masa.sources;
    const main = await get(title);
    if (!main) return [];
    let list = S.parseVoyage(main);
    const districts = S.voyageDistricts(main, title);
    // huge cities (New York, London…) have districts with their own sub-districts: go one level deeper, up to 12 pages
    const pages = [];
    await mapLimit(districts, 4, async d => {
      const wt = await get(d);
      const items = S.parseVoyage(wt);
      pages.push(...items.map(x => ({ ...x, district: d.split("/").pop() })));
      if (items.length < 8) for (const sub of S.voyageDistricts(wt, d).slice(0, 4)) pages.push({ _sub: sub });
    });
    const subs = pages.filter(p => p._sub).map(p => p._sub).slice(0, 12);
    list = list.concat(pages.filter(p => !p._sub));
    await mapLimit(subs, 4, async d => { list = list.concat(S.parseVoyage(await get(d)).map(x => ({ ...x, district: d.split("/").pop() }))); });
    return list;
  }

  /* Wikipedia articles with coordinates near a point: a fast, reliable list of real sights. */
  async function wikiGeo(lang, lat, lng, radius, signal) {
    try {
      const u = `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&origin=*&gslimit=100&gsradius=${Math.min(10000, Math.round(radius))}&gscoord=${lat.toFixed(5)}|${lng.toFixed(5)}`;
      const j = await getJSON(u, {}, 15000, signal);
      return (j.query?.geosearch || []).map(g => ({ title: g.title, lat: g.lat, lng: g.lon, pageid: g.pageid, lang }));
    } catch { return []; }
  }

  /* Hebrew labels, short descriptions and Wikipedia article titles, 50 ids per call. */
  async function wikidata(ids, signal) {
    const out = {};
    const uniq = [...new Set(ids.filter(id => /^Q\d+$/.test(id)))];
    for (let i = 0; i < uniq.length; i += 50) {
      const chunk = uniq.slice(i, i + 50);
      const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels|descriptions|sitelinks&languages=he|en&sitefilter=hewiki|enwiki&ids=${chunk.join("|")}`;
      try {
        const j = await getJSON(u, {}, 20000, signal);
        for (const [id, e] of Object.entries(j.entities || {})) {
          out[id] = {
            labelHe: e.labels?.he?.value || null,
            descHe: e.descriptions?.he?.value || null,
            hewiki: e.sitelinks?.hewiki?.title || null,
            enwiki: e.sitelinks?.enwiki?.title || null
          };
        }
      } catch (e) { if (signal?.aborted) throw e; }
    }
    return out;
  }

  /* search a place by name or address near the trip (Nominatim), for "my hotel" and restaurants not on our lists */
  async function searchNear(q, lat, lng, signal) {
    const d = 0.25;
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&namedetails=1&accept-language=he,en&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}&bounded=1&q=${encodeURIComponent(q)}`;
    const r = await getJSON(u, {}, 15000, signal);
    return (r || []).map(x => {
      const a = x.address || {}, nd = x.namedetails || {};
      const street = [a.road, a.house_number].filter(Boolean).join(" ");
      return { osmType: x.osm_type, osmId: x.osm_id, category: x.category, type: x.type, lat: +x.lat, lng: +x.lon,
        name: nd["name:he"] || nd.name || x.name || x.display_name.split(",")[0], local: nd.name || x.name || x.display_name.split(",")[0],
        address: street || x.display_name.split(",").slice(0, 3).join(","), display: x.display_name };
    });
  }

  /* how famous each sight is (number of Wikipedia languages), see sources.js */
  async function fame(els, signal, voyage) {
    const S = Masa.sources, ids = S.fameIds(els, 600, voyage), out = { n: {}, he: {} };
    const chunks = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    await mapLimit(chunks, 3, async c => { try { S.fameParse(await getJSON(S.fameUrl(c), {}, 12000, signal), out); } catch {} });
    return out;
  }

  /* First paragraph + photo of a Wikipedia article. */
  async function wikiSummary(lang, title, signal) {
    if (!title) return null;
    try {
      const j = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {}, 15000, signal);
      if (!j || j.type === "disambiguation") return null;
      return {
        extract: j.extract || "",
        url: j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        image: j.thumbnail?.source || null,
        lang
      };
    } catch { return null; }
  }

  /* Real walking route through all stops of a day. */
  async function walkRoute(stops, signal, profile = "foot") {
    if (!stops || stops.length < 2) return null;
    const coords = stops.map(s => `${(+s.lng).toFixed(6)},${(+s.lat).toFixed(6)}`).join(";");
    try {
      const j = await getJSON(`https://routing.openstreetmap.de/routed-${profile === "car" ? "car" : "foot"}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {}, 20000, signal);
      const r = j.routes?.[0];
      if (!r) return null;
      return { line: r.geometry.coordinates.map(([x, y]) => [y, x]), legs: r.legs.map(l => ({ m: l.distance, s: l.duration })) };
    } catch { return null; }
  }

  return { searchNear, fame, getJSON, mapLimit, geocode, overpass, voyage, weather, rateToILS, wikiGeo, wikidata, wikiSummary, walkRoute };
})();
