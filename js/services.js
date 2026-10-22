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
      country: x.address?.country || "",
      cc: (x.address?.country_code || "").toLowerCase(),
      bbox: bb.length === 4 ? { s: bb[0], n: bb[1], w: bb[2], e: bb[3] } : null
    };
  }

  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ];
  /* Ask all mirrors at once and take the first good answer. Public Overpass servers are often busy. */
  async function overpass(query, signal) {
    const ctls = OVERPASS.map(() => new AbortController());
    const stopAll = () => ctls.forEach(c => c.abort());
    signal?.addEventListener("abort", stopAll);
    try {
      return await Promise.any(OVERPASS.map((ep, i) => getJSON(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query)
      }, 35000, ctls[i].signal).then(j => {
        if (!j || !Array.isArray(j.elements) || (j.remark && /runtime error|timed out/i.test(j.remark) && !j.elements.length)) throw new Error("overpass busy");
        return j;
      })));
    } catch (e) {
      throw signal?.aborted ? e : new Error("overpass unavailable");
    } finally {
      stopAll();
      signal?.removeEventListener("abort", stopAll);
    }
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

  /* First paragraph + photo of a Wikipedia article. */
  async function wikiSummary(lang, title, signal) {
    if (!title) return null;
    try {
      const j = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {}, 15000, signal);
      if (!j || j.type === "disambiguation") return null;
      return {
        extract: j.extract || "",
        url: j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        image: j.thumbnail?.source ? j.thumbnail.source.replace(/\/(\d+)px-/, "/640px-") : null,
        lang
      };
    } catch { return null; }
  }

  /* Real walking route through all stops of a day. */
  async function walkRoute(stops, signal) {
    if (!stops || stops.length < 2) return null;
    const coords = stops.map(s => `${(+s.lng).toFixed(6)},${(+s.lat).toFixed(6)}`).join(";");
    try {
      const j = await getJSON(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson`, {}, 20000, signal);
      const r = j.routes?.[0];
      if (!r) return null;
      return { line: r.geometry.coordinates.map(([x, y]) => [y, x]), legs: r.legs.map(l => ({ m: l.distance, s: l.duration })) };
    } catch { return null; }
  }

  return { getJSON, mapLimit, geocode, overpass, wikidata, wikiSummary, walkRoute };
})();
