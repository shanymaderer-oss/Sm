/* מסע · data sources shared by the website and the GitHub city-data script.
   - OpenStreetMap (Overpass): every restaurant, café, mall, museum, park… with hours, cuisine, website, phone.
   - Wikivoyage: free travel guide written by travelers. Its "Eat / Drink / Buy / See / Do" listings are
     curated recommendations, grouped by price level (budget / mid-range / splurge).
   Works in the browser (window.Masa.sources) and in Node (module.exports). */
(function (root) {
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  /* Four small queries. They do not depend on the traveler's interests, so one fetch serves every kind of trip. */
  function buildQueries(lat, lng, R) {
    const A = (r = R) => `(around:${Math.round(r)},${lat.toFixed(5)},${lng.toFixed(5)})`;
    const H = "[out:json][timeout:25];";
    return {
      sights: H + `(nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"]${A()};nwr["historic"~"^(monument|castle|ruins|archaeological_site|fort|city_gate|palace|church|monastery|memorial|building|tower|aqueduct|bridge)$"]["name"]["wikidata"]${A()};);out center tags 260;`,
      restaurants: H + `nwr["amenity"="restaurant"]["name"]${A(R * 0.55)};out center tags 450;`,
      cafes: H + `(nwr["amenity"~"^(cafe|ice_cream|marketplace|food_court)$"]["name"]${A(R * 0.5)};nwr["shop"~"^(bakery|pastry|confectionery|deli|wine)$"]["name"]${A(R * 0.4)};);out center tags 300;`,
      extra: H + `(nwr["shop"~"^(mall|department_store)$"]["name"]${A(R * 1.4)};nwr["amenity"~"^(bar|pub|nightclub|biergarten)$"]["name"]${A(R * 0.5)};nwr["amenity"="place_of_worship"]["name"]["wikidata"]${A()};nwr["leisure"~"^(park|garden|water_park)$"]["name"]["wikidata"]${A()};nwr["natural"="beach"]["name"]${A()};);out center tags 300;`
    };
  }

  /* keep only the tags the app uses, so cached data stays small */
  const KEEP = ["name", "name:he", "name:en", "tourism", "historic", "amenity", "leisure", "natural", "shop", "building", "wikidata", "wikipedia",
    "website", "contact:website", "url", "phone", "contact:phone", "opening_hours", "fee", "charge", "cuisine", "heritage", "wikimedia_commons", "image",
    "outdoor_seating", "diet:vegetarian", "diet:vegan", "diet:kosher", "diet:halal", "wheelchair", "brand", "description", "michelin:stars", "stars", "addr:street", "addr:housenumber", "takeaway", "reservation"];
  const slim = els => els.map(e => ({
    type: e.type, id: e.id, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon,
    tags: Object.fromEntries(Object.entries(e.tags || {}).filter(([k]) => KEEP.includes(k)))
  })).filter(e => e.lat != null);

  /* ---------- Wikivoyage ---------- */
  function cleanWiki(t) {
    if (!t) return "";
    let s = String(t);
    s = s.replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "");
    for (let i = 0; i < 4; i++) s = s.replace(/\{\{[^{}]*\}\}/g, m => {
      const parts = m.slice(2, -2).split("|");
      const name = parts[0].trim().toLowerCase();
      if (["km", "mi", "m", "ft"].includes(name)) return (parts[1] || "").trim() + " " + name;
      if (["convert", "lang", "nowrap", "nobr"].includes(name)) return parts.slice(1).filter(p => !p.includes("=")).join(" ");
      if (["price", "eur", "usd", "gbp", "czk", "chf", "jpy", "thb", "huf", "pln", "dkk", "sek", "nok", "try"].includes(name)) return parts.slice(1).join(" ") + (name !== "price" ? " " + name.toUpperCase() : "");
      return "";
    });
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/\S+\]/g, "");
    s = s.replace(/'''?/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    return s;
  }
  function splitParams(body) {
    const out = [];
    let depthC = 0, depthS = 0, cur = "";
    for (let i = 0; i < body.length; i++) {
      const two = body.slice(i, i + 2);
      if (two === "{{") { depthC++; cur += two; i++; continue; }
      if (two === "}}") { depthC--; cur += two; i++; continue; }
      if (two === "[[") { depthS++; cur += two; i++; continue; }
      if (two === "]]") { depthS--; cur += two; i++; continue; }
      if (body[i] === "|" && depthC === 0 && depthS === 0) { out.push(cur); cur = ""; continue; }
      cur += body[i];
    }
    out.push(cur);
    return out;
  }
  const priceClass = h => /budget|cheap|inexpensive|under/i.test(h) ? "budget" : /mid/i.test(h) ? "mid" : /splurge|expensive|upscale|fine|high/i.test(h) ? "splurge" : null;
  const TYPES = ["see", "do", "buy", "eat", "drink", "sleep", "listing", "marker", "go"];

  function parseVoyage(wikitext) {
    const out = [];
    const text = String(wikitext || "");
    const re = /(^|\n)(={2,4})\s*([^=\n]+?)\s*\2[ \t]*(?=\n|$)|\{\{\s*(see|do|buy|eat|drink|sleep|listing|marker|go)\s*(?=[|}\n])/gi;
    let m, section = "", sub = "";
    while ((m = re.exec(text))) {
      if (m[2]) {
        if (m[2].length === 2) { section = m[3].trim(); sub = ""; } else sub = m[3].trim();
        continue;
      }
      let i = m.index + 2, depth = 1;
      while (i < text.length && depth > 0) {
        if (text.startsWith("{{", i)) { depth++; i += 2; }
        else if (text.startsWith("}}", i)) { depth--; i += 2; }
        else i++;
      }
      const body = text.slice(m.index + 2, i - 2);
      re.lastIndex = i;
      const parts = splitParams(body);
      const tname = parts[0].trim().toLowerCase();
      const p = {};
      for (const part of parts.slice(1)) {
        const k = part.indexOf("=");
        if (k < 0) continue;
        p[part.slice(0, k).trim().toLowerCase()] = part.slice(k + 1).trim();
      }
      let type = TYPES.includes(tname) && tname !== "listing" && tname !== "marker" ? tname : (p.type || "").toLowerCase();
      if (!type) type = /eat/i.test(section) ? "eat" : /drink/i.test(section) ? "drink" : /buy|shop/i.test(section) ? "buy" : /see/i.test(section) ? "see" : /do/i.test(section) ? "do" : "";
      const name = cleanWiki(p.name);
      if (!name || !["see", "do", "buy", "eat", "drink"].includes(type)) continue;
      const lat = parseFloat(p.lat), lng = parseFloat(p.long ?? p.lon ?? p.lng);
      out.push({
        type, name, alt: cleanWiki(p.alt) || null,
        lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null,
        price: cleanWiki(p.price) || null, priceClass: priceClass(sub) || priceClass(p.price || ""),
        hours: cleanWiki(p.hours) || null, url: /^https?:\/\//.test(p.url || "") ? p.url.trim() : null,
        phone: cleanWiki(p.phone) || null, address: cleanWiki(p.address) || null,
        content: cleanWiki(p.content || p.description).slice(0, 420) || null,
        wikidata: /^Q\d+$/.test(p.wikidata || "") ? p.wikidata : null
      });
    }
    return out;
  }
  /* district sub-pages of big cities, e.g. "Prague/Old Town" */
  function voyageDistricts(wikitext, title) {
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ _]/g, "[ _]");
    const re = new RegExp(`\\[\\[(${esc}/[^\\]|#]+)`, "g");
    const set = new Set();
    let m;
    while ((m = re.exec(wikitext))) set.add(m[1].trim());
    return [...set].slice(0, 10);
  }

  const api = { OVERPASS, buildQueries, slim, parseVoyage, voyageDistricts, cleanWiki };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.Masa = root.Masa || {}; root.Masa.sources = api; }
})(typeof window !== "undefined" ? window : globalThis);
