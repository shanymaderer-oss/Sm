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

  /* Small queries over a bounding box. Box queries are much faster on the public servers than "around" (radius) queries. */
  function bbox(lat, lng, r) {
    const dLat = r / 111320, dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
    return `${(lat - dLat).toFixed(5)},${(lng - dLng).toFixed(5)},${(lat + dLat).toFixed(5)},${(lng + dLng).toFixed(5)}`;
  }
  function buildQueries(lat, lng, R) {
    const H = (r, t = 25) => `[out:json][timeout:${t}][bbox:${bbox(lat, lng, r)}];`;
    return {
      sights: H(R) + `(nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"];nwr["historic"]["name"]["wikidata"];);out center tags 260;`,
      restaurants: H(R * 0.5) + `nwr["amenity"="restaurant"]["name"];out center tags 450;`,
      cafes: H(R * 0.45) + `(nwr["amenity"~"^(cafe|ice_cream|marketplace|food_court)$"]["name"];nwr["shop"~"^(bakery|pastry|confectionery|deli|wine)$"]["name"];);out center tags 300;`,
      hotels: H(R * 1.1) + `nwr["tourism"~"^(hotel|hostel|guest_house|apartment|motel)$"]["name"];out center tags 350;`,
      shopping: H(R * 0.9) + `(nwr["shop"~"^(mall|department_store)$"]["name"];nwr["amenity"~"^(bar|pub|nightclub|biergarten)$"]["name"];);out center tags 300;`,
      diet: H(R * 2) + `(nwr["diet:kosher"~"^(yes|only)$"]["name"];nwr["cuisine"~"kosher|jewish"]["name"];nwr["diet:vegan"="only"]["name"];nwr["diet:vegetarian"="only"]["name"];nwr["amenity"="place_of_worship"]["religion"="jewish"]["name"];);out center tags 250;`,
      extra: H(R * 1.1) + `(nwr["amenity"="place_of_worship"]["name"]["wikidata"];nwr["leisure"~"^(park|garden|water_park)$"]["name"]["wikidata"];nwr["natural"="beach"]["name"];);out center tags 200;`,
      /* famous bridges, squares and castles: often not tagged as tourist sights at all */
      landmarks: H(R) + `(nwr["man_made"="bridge"]["wikidata"]["name"];nwr["place"="square"]["wikidata"]["name"];nwr["highway"="pedestrian"]["area"="yes"]["wikidata"]["name"];nwr["historic"="castle"]["wikidata"]["name"];nwr["amenity"="clock"]["wikidata"];nwr["man_made"="tower"]["wikidata"]["name"];);out center tags 150;`,
      /* every fashion, shoe, gift… shop with a street address. Counted per street to find the main shopping streets. */
      streets: H(R, 50) + `nwr["shop"~"^(${STREET_SHOPS})$"]["addr:street"];out center tags 5000;`
    };
  }

  const STREET_SHOPS = "clothes|shoes|boutique|jewelry|fashion_accessories|bag|cosmetics|perfumery|gift|watches|leather|department_store|books|toys|sports|optician|chocolate|souvenir|fashion|tailor|hat|variety_store|mobile_phone|electronics|art|antiques|interior_decoration|houseware";
  const SHOP_HE = { clothes: "אופנה", boutique: "בוטיקים", fashion: "אופנה", shoes: "נעליים", jewelry: "תכשיטים", watches: "שעונים", bag: "תיקים", leather: "מוצרי עור",
    cosmetics: "קוסמטיקה", perfumery: "בשמים", gift: "מתנות", souvenir: "מזכרות", books: "ספרים", toys: "צעצועים", sports: "ספורט", department_store: "כלבו",
    chocolate: "שוקולד", optician: "משקפיים", electronics: "אלקטרוניקה", mobile_phone: "טלפונים", art: "אמנות", antiques: "עתיקות", interior_decoration: "עיצוב לבית", houseware: "כלי בית" };
  const dkm = (a, b) => { const k = Math.cos(a.lat * Math.PI / 180); return Math.hypot(a.lat - b.lat, (a.lng - b.lng) * k) * 111.32; };
  const SQUARE = /(náměstí|namesti|piazza|plaza|\bplace\b|platz|square|\btér\b|\bplac\b|rynek|praça|plaça|meydan|площад)/i;
  /* many shops, of many kinds (a street of only jewelers is a niche), with well-known brands */
  const streetScore = s => s.n * (1.15 - 0.5 * (s.topShare ?? 0.6)) + (s.brands || 0) * 0.4 + Math.min(2, s.mentions || 0) * 6;
  /* Main shopping streets: the streets with the most shops on one walkable stretch (about 700 m). */
  function shopStreets(els, max = 14) {
    const by = {};
    for (const e of els || []) {
      const t = e.tags || {}, st = (t["addr:street"] || "").trim();
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      if (!st || lat == null) continue;
      (by[st] = by[st] || []).push({ lat, lng, k: t.shop, brand: !!t.brand });
    }
    const out = [];
    for (const [name, pts] of Object.entries(by)) {
      if (pts.length < 6) continue;
      let best = null;
      for (const p of pts) { const near = pts.filter(q => dkm(p, q) < 0.35); if (!best || near.length > best.length) best = near; }
      if (best.length < 6) continue;
      const lat = best.reduce((a, p) => a + p.lat, 0) / best.length, lng = best.reduce((a, p) => a + p.lng, 0) / best.length;
      const kinds = Object.entries(best.reduce((a, p) => (a[p.k] = (a[p.k] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
      // the two ends of the stretch, for the walking direction
      let ends = [best[0], best[0]], far = 0;
      for (const a of best) for (const b of best) { const d = dkm(a, b); if (d > far) { far = d; ends = [a, b]; } }
      const topShare = kinds.length ? kinds[0][1] / best.length : 1;
      // a square lined with a few shops is not a shopping street, unless it is a big one (Wenceslas Square)
      if (SQUARE.test(name) && best.length < 15) continue;
      out.push({ name, n: best.length, topShare: +topShare.toFixed(2), total: pts.length, brands: best.filter(p => p.brand).length, lat: +lat.toFixed(6), lng: +lng.toFixed(6),
        len: Math.round(far * 1000), kinds: kinds.slice(0, 4).map(([k, n]) => [k, n]), ends: ends.map(p => [+p.lat.toFixed(6), +p.lng.toFixed(6)]) });
    }
    return out.sort((a, b) => streetScore(b) - streetScore(a)).slice(0, max);
  }

  /* keep only the tags the app uses, so cached data stays small */
  const KEEP = ["name", "name:he", "name:en", "tourism", "historic", "amenity", "leisure", "natural", "shop", "building", "wikidata", "wikipedia",
    "website", "contact:website", "url", "phone", "contact:phone", "opening_hours", "fee", "charge", "cuisine", "heritage", "wikimedia_commons", "image",
    "outdoor_seating", "diet:vegetarian", "diet:vegan", "diet:kosher", "diet:halal", "wheelchair", "brand", "description", "michelin:stars", "stars", "addr:street", "addr:housenumber", "takeaway", "reservation", "rooms", "beds", "internet_access", "operator", "religion", "denomination", "man_made", "place", "highway", "area"];
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
  const priceClass = h => /budget|cheap|inexpensive|under|hostel/i.test(h) ? "budget" : /mid/i.test(h) ? "mid" : /splurge|expensive|upscale|fine|high/i.test(h) ? "splurge" : null;
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
      if (!name || !["see", "do", "buy", "eat", "drink", "sleep"].includes(type)) continue;
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

  /* How famous a place is: the number of Wikipedia languages that have an article about it (Wikidata sitelinks).
     The Eiffel Tower has over 150, a small local museum 2 or 3. Also keeps the Hebrew article title. */
  const SIGHTISH = t => t.tourism || t.historic || t.amenity === "place_of_worship" || t.leisure || t.natural || t.man_made || t.place === "square" || t.highway === "pedestrian" || t.amenity === "clock";
  function fameIds(els, max = 450) {
    const ids = [];
    const seen = new Set();
    for (const e of els || []) {
      const t = e.tags || {}, id = t.wikidata;
      if (!/^Q\d+$/.test(id || "") || seen.has(id) || !SIGHTISH(t)) continue;
      seen.add(id); ids.push(id);
    }
    return ids.slice(0, max);
  }
  const fameUrl = ids => `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=sitelinks&ids=${ids.join("|")}`;
  function fameParse(j, out = { n: {}, he: {} }) {
    for (const [id, e] of Object.entries(j?.entities || {})) {
      const links = Object.keys(e.sitelinks || {}).filter(k => /wiki$/.test(k) && !/(commons|species|wikiquote|wikisource|wikivoyage|wikinews|wikibooks)wiki$/.test(k));
      out.n[id] = links.length;
      if (e.sitelinks?.hewiki?.title) out.he[id] = e.sitelinks.hewiki.title;
    }
    return out;
  }

  const api = { fameIds, fameUrl, fameParse, OVERPASS, bbox, buildQueries, slim, shopStreets, streetScore, SHOP_HE, parseVoyage, voyageDistricts, cleanWiki };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.Masa = root.Masa || {}; root.Masa.sources = api; }
})(typeof window !== "undefined" ? window : globalThis);
