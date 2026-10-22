/* מסע · trip planner. Builds a real trip from OpenStreetMap + Wikipedia with no AI,
   then lets the optional AI guide add stories and tips on top of real places. */
window.Masa = window.Masa || {};
Masa.planner = (() => {
  const { CATS, PHRASES, COUNTRY_LANG, ETIQUETTE_GENERIC } = window.MASA_DATA;
  const svc = Masa.svc;

  const km = (a, b) => {
    const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  /* minutes on site, by category */
  const DUR = { art: 120, history: 75, view: 40, religion: 45, nature: 60, food: 75, night: 90, shopping: 60, family: 120 };

  /* typical crowd level per hour, 07:00–22:00 (16 values). An estimate, shown as such. */
  const BUSY = {
    art:      [0, 0, 30, 60, 85, 90, 85, 80, 75, 60, 35, 0, 0, 0, 0, 0],
    history:  [10, 25, 45, 70, 85, 90, 88, 85, 80, 70, 55, 40, 25, 0, 0, 0],
    view:     [10, 15, 25, 40, 55, 60, 60, 60, 65, 75, 90, 95, 70, 40, 20, 10],
    religion: [10, 25, 45, 60, 70, 65, 50, 45, 50, 45, 35, 20, 0, 0, 0, 0],
    nature:   [15, 25, 35, 45, 55, 60, 60, 60, 65, 70, 65, 50, 30, 15, 0, 0],
    food:     [0, 0, 10, 15, 40, 85, 90, 50, 20, 20, 30, 60, 90, 95, 70, 40],
    night:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 35, 55, 75, 90, 95],
    shopping: [0, 0, 15, 35, 55, 65, 70, 70, 75, 80, 80, 70, 40, 0, 0, 0],
    family:   [0, 0, 35, 65, 85, 90, 85, 80, 70, 50, 30, 0, 0, 0, 0, 0]
  };

  const WHY = {
    art: "מוזיאון או גלריה שמומלצים לחובבי אמנות.",
    history: "אתר היסטורי שמספר חלק מהסיפור של העיר.",
    view: "מקום מצולם במיוחד או נקודת תצפית.",
    religion: "מבנה דתי מרשים, בדרך כלל פתוח למבקרים.",
    nature: "פארק או גן לנשימה בין האטרקציות.",
    food: "מקום אוכל שנבחר לפי הקרבה למסלול.",
    night: "מקום לבילוי בערב.",
    shopping: "מקום לקניות ולשיטוט.",
    family: "אטרקציה שמתאימה גם לילדים."
  };
  const TIPS = {
    art: "הרבה מוזיאונים סגורים יום אחד בשבוע. כדאי לבדוק באתר לפני שמגיעים.",
    history: "נעליים נוחות ובקבוק מים. באתרים פתוחים יש בדרך כלל מעט צל.",
    view: "הכי יפה בשקיעה. הגיעו בערך 20 דקות לפני.",
    religion: "לבוש צנוע: כתפיים וברכיים מכוסות. בזמן תפילה לא מסתובבים בפנים.",
    nature: "מקום טוב לפיקניק. אפשר לקנות משהו בשוק בדרך.",
    food: "שאלו מה המנה של הבית. תפריט באנגלית בלבד ליד אטרקציה הוא לפעמים סימן למלכודת תיירים.",
    night: "בהרבה ערים הלילה מתחיל מאוחר. בדקו מתי המקום מתמלא.",
    shopping: "השוו מחירים לפני שקונים. בשווקים בהרבה מדינות מקובל להתמקח.",
    family: "בחופשות כדאי להזמין מראש ולהגיע בפתיחה."
  };
  const LOCAL_CUISINE = {
    it: ["italian", "roman", "regional", "pizza"], fr: ["french", "regional"], es: ["spanish", "tapas", "regional"],
    pt: ["portuguese", "regional"], gr: ["greek", "regional"], cz: ["czech", "regional"], jp: ["japanese", "ramen", "sushi", "regional"],
    th: ["thai", "regional"], de: ["german", "regional"], at: ["austrian", "regional"], gb: ["british", "regional"],
    us: ["american", "regional"], nl: ["dutch", "regional"], hu: ["hungarian", "regional"], tr: ["turkish", "regional"]
  };

  function catFromTags(t) {
    if (/^(museum|gallery)$/.test(t.tourism)) return "art";
    if (/^(zoo|aquarium|theme_park)$/.test(t.tourism) || t.leisure === "water_park") return "family";
    if (t.tourism === "viewpoint") return "view";
    if (t.amenity === "place_of_worship") return "religion";
    if (/^(restaurant|cafe|marketplace|food_court)$/.test(t.amenity)) return "food";
    if (/^(bar|pub|nightclub)$/.test(t.amenity)) return "night";
    if (t.shop) return "shopping";
    if (/^(park|garden)$/.test(t.leisure) || t.natural === "beach") return "nature";
    if (t.historic) return /^(church|monastery)$/.test(t.historic) ? "religion" : "history";
    if (t.tourism === "attraction") return /^(church|cathedral|chapel|basilica|mosque|synagogue|temple)$/.test(t.building) ? "religion" : "view";
    return "view";
  }

  function buildQuery(lat, lng, R, interests) {
    const A = (r = R) => `(around:${Math.round(r)},${lat.toFixed(5)},${lng.toFixed(5)})`;
    const q = [];
    q.push(`(nwr["tourism"~"^(attraction|museum|gallery|viewpoint)$"]["name"]${A()};nwr["historic"~"^(monument|castle|ruins|archaeological_site|fort|city_gate|palace|church|monastery|memorial|building|tower|aqueduct|bridge)$"]["name"]["wikidata"]${A()};)->.a;.a out center tags qt 280;`);
    q.push(`(nwr["amenity"="marketplace"]["name"]${A()};nwr["amenity"~"^(restaurant|cafe)$"]["name"]["wikidata"]${A()};nwr["amenity"="restaurant"]["name"]["cuisine"]["website"]${A(R * 0.45)};)->.f;.f out center tags qt 160;`);
    q.push(`nwr["amenity"="place_of_worship"]["name"]["wikidata"]${A()}->.r;.r out center tags 60;`);
    q.push(`(nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"]${A()};nwr["natural"="beach"]["name"]${A()};)->.n;.n out center tags 50;`);
    if (interests.includes("night")) q.push(`nwr["amenity"~"^(bar|pub|nightclub)$"]["name"]${A(R * 0.6)}->.b;.b out center tags 80;`);
    if (interests.includes("shopping")) q.push(`nwr["shop"~"^(mall|department_store)$"]["name"]${A()}->.s;.s out center tags 30;`);
    if (interests.includes("family")) q.push(`(nwr["tourism"~"^(zoo|aquarium|theme_park)$"]["name"]${A(R * 2)};nwr["leisure"="water_park"]["name"]${A(R * 2)};)->.k;.k out center tags 30;`);
    return `[out:json][timeout:25];${q.join("")}`;
  }

  function score(p, interests, cc) {
    const t = p.tags;
    let s = 0;
    if (p.wikidata) s += 4;
    if (t.wikipedia) s += 3;
    if (t["name:he"]) s += 3;
    if (t.tourism === "attraction") s += 2;
    if (t.tourism === "museum") s += 1.5;
    if (t.heritage) s += 1.5;
    if (p.website) s += 0.8;
    if (t.wikimedia_commons || t.image) s += 0.6;
    if (t.opening_hours) s += 0.3;
    if (interests.includes(p.cat)) s += 4;
    if (p.cat === "food") {
      if (t.amenity === "marketplace") s += 2;
      const cu = (t.cuisine || "").toLowerCase();
      if ((LOCAL_CUISINE[cc] || []).some(c => cu.includes(c))) s += 2.5;
      if (/(burger|kebab|fast_food|chicken)/.test(cu)) s -= 2;
      if (/mcdonald|burger king|kfc|starbucks|subway|domino/i.test(t.name || "")) s -= 10;
    }
    if (t.tourism === "attraction" && !p.wikidata && !t.historic) s -= 1.5;
    return s - p.dist * 0.55;
  }

  function normalize(els, center, interests, cc) {
    const seen = new Map();
    for (const e of els || []) {
      const t = e.tags || {};
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      if (lat == null || lng == null) continue;
      const name = t["name:he"] || t.name;
      if (!name) continue;
      const p = {
        osm: `${e.type}/${e.id}`, name, local: t.name || name, cat: catFromTags(t), lat, lng, tags: t,
        wikidata: t.wikidata || null, website: t.website || t["contact:website"] || t.url || null,
        hours: t.opening_hours || null, fee: t.fee || null, charge: t.charge || null
      };
      p.dist = km(center, p);
      p.score = score(p, interests, cc);
      const key = t.wikidata || (t.name || name).toLowerCase().replace(/\s+/g, " ").trim();
      const prev = seen.get(key);
      if (!prev || p.score > prev.score) seen.set(key, p);
    }
    return [...seen.values()];
  }

  /* greedy pick with a diversity penalty and a minimum gap between places */
  function pick(cands, n, minGapKm = 0.15) {
    const out = [], cnt = {}, rest = [...cands];
    while (out.length < n && rest.length) {
      let bi = -1, bv = -Infinity;
      rest.forEach((p, i) => {
        if (out.some(o => km(o, p) < minGapKm)) return;
        const v = p.score - 2.2 * (cnt[p.cat] || 0);
        if (v > bv) { bv = v; bi = i; }
      });
      if (bi < 0) break;
      const p = rest.splice(bi, 1)[0];
      out.push(p);
      cnt[p.cat] = (cnt[p.cat] || 0) + 1;
    }
    return out;
  }

  /* split places into days as wedges around the center, starting after the biggest empty gap */
  function splitDays(pts, days) {
    if (days <= 1 || pts.length <= 1) return [pts];
    const c = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
    const k = Math.cos(c.lat * Math.PI / 180);
    const arr = pts.map(p => ({ p, a: Math.atan2(p.lat - c.lat, (p.lng - c.lng) * k) })).sort((x, y) => x.a - y.a);
    let start = 0, best = -1;
    for (let i = 0; i < arr.length; i++) {
      const nx = arr[(i + 1) % arr.length];
      const gap = (nx.a - arr[i].a + 2 * Math.PI) % (2 * Math.PI);
      if (gap > best) { best = gap; start = (i + 1) % arr.length; }
    }
    const rot = [...arr.slice(start), ...arr.slice(0, start)].map(x => x.p);
    const out = [];
    for (let d = 0; d < days; d++) out.push(rot.slice(Math.round(d * rot.length / days), Math.round((d + 1) * rot.length / days)));
    return out.filter(x => x.length);
  }

  /* shortest open walking order (brute force for small days) */
  function orderDay(pts) {
    if (pts.length <= 2) return pts;
    if (pts.length > 7) {
      const out = [pts[0]], rest = pts.slice(1);
      while (rest.length) { const last = out[out.length - 1]; rest.sort((a, b) => km(last, a) - km(last, b)); out.push(rest.shift()); }
      return out;
    }
    let best = null, bestLen = Infinity;
    const perm = (arr, used, cur, len) => {
      if (len >= bestLen) return;
      if (cur.length === arr.length) { bestLen = len; best = [...cur]; return; }
      for (let i = 0; i < arr.length; i++) {
        if (used[i]) continue;
        used[i] = true; cur.push(arr[i]);
        perm(arr, used, cur, len + (cur.length > 1 ? km(cur[cur.length - 2], arr[i]) : 0));
        cur.pop(); used[i] = false;
      }
    };
    perm(pts, [], [], 0);
    return best;
  }

  /* first HH:MM-HH:MM range in an OSM opening_hours string */
  function openRange(h) {
    if (!h) return null;
    if (/24\/7/.test(h)) return [0, 24];
    const m = h.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return [+m[1] + +m[2] / 60, (+m[3] || 24) + +m[4] / 60];
  }
  function busyFor(cat, hours) {
    let b = [...(BUSY[cat] || BUSY.history)];
    const r = openRange(hours);
    if (r) b = b.map((v, i) => { const h = 7 + i; return h + 0.5 < r[0] || h >= r[1] ? 0 : Math.max(v, 15); });
    return b;
  }
  function bestTime(busy, cat) {
    const cands = busy.map((v, i) => ({ v, h: 7 + i })).filter(x => x.v > 0 && (cat === "night" ? x.h >= 19 : cat === "view" ? true : x.h >= 8 && x.h <= 18));
    if (!cands.length) return "";
    if (cat === "view") { const peak = cands.reduce((a, b) => b.v > a.v ? b : a); return `לשקיעה, בסביבות ${peak.h}:00. לפחות אנשים: בבוקר`; }
    const low = cands.reduce((a, b) => b.v < a.v ? b : a);
    return `בסביבות ${String(low.h).padStart(2, "0")}:00`;
  }
  const fmtTime = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
  const fmtDur = m => {
    if (m < 60) return `${m} דקות`;
    const named = { 60: "שעה", 75: "שעה ורבע", 90: "שעה וחצי", 120: "שעתיים", 150: "שעתיים וחצי", 180: "3 שעות" };
    if (named[m]) return named[m];
    const h = Math.floor(m / 60), r = m % 60;
    return `${h === 1 ? "שעה" : h === 2 ? "שעתיים" : h + " שעות"}${r ? ` ו-${r} דק׳` : ""}`;
  };
  function costText(p, budget) {
    if (p.fee === "no") return "חינם";
    if (p.charge) return p.charge;
    if (p.cat === "food") return { "חסכוני": "זול", "בינוני": "בינוני", "מפנק": "יקר יותר" }[budget] || "בינוני";
    if (p.fee === "yes") return "בתשלום";
    return { art: "בתשלום, בדרך כלל", family: "בתשלום", view: "בדרך כלל חינם", nature: "בדרך כלל חינם", religion: "בדרך כלל חינם", night: "לפי מה שמזמינים", shopping: "—" }[p.cat] || "תלוי במקום";
  }
  function bookingFor(p) {
    const needed = p.cat === "art" || p.cat === "family" || p.fee === "yes" || p.tags?.tourism === "museum";
    const q = `${p.local} official site tickets`;
    if (needed) return {
      needed, query: q, url: p.website || null,
      steps: [
        p.website ? "פותחים את האתר הרשמי של המקום (הכפתור למטה)." : "מחפשים את האתר הרשמי (הכפתור למטה). היזהרו מאתרי מכירה חיצוניים עם עמלה.",
        "בודקים שעות פתיחה ויום סגור שבועי.",
        "בוחרים תאריך ושעת כניסה. בבוקר בדרך כלל פחות עמוס.",
        "משלמים באתר ושומרים את הכרטיס בטלפון."
      ]
    };
    if (p.cat === "food") return {
      needed: false, query: `${p.local} reservation`, url: p.website || null,
      steps: [p.hours ? `שעות פתיחה לפי OpenStreetMap: ${p.hours}` : "בודקים שעות פתיחה בגוגל מפות.", p.website ? "אפשר לבדוק באתר של המקום אם יש הזמנת שולחן." : "אם אין הזמנה מראש, מגיעים מוקדם או קצת אחרי שעת השיא."]
    };
    return {
      needed: false, query: q, url: p.website || null,
      steps: ["אין צורך בהזמנה מראש.", p.hours ? `שעות פתיחה לפי OpenStreetMap: ${p.hours}` : "בדקו שעות פתיחה לפני שמגיעים."]
    };
  }
  const firstSentences = (text, max) => {
    if (!text) return "";
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("׃ "));
    return i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + "…";
  };

  function toStop(p, budget) {
    const busy = busyFor(p.cat, p.hours);
    return {
      name: p.name, local: p.local, cat: p.cat, lat: p.lat, lng: p.lng,
      time: "", duration: fmtDur(DUR[p.cat] || 60), _min: DUR[p.cat] || 60, cost: costText(p, budget),
      why: WHY[p.cat], history: "", histLang: "he", wikiUrl: null, fact: "", busy, busySrc: "est", best: bestTime(busy, p.cat),
      tip: TIPS[p.cat], nearby: [], booking: bookingFor(p), website: p.website, image: null, hours: p.hours,
      wikidata: p.wikidata, osm: p.osm, _wikiTag: p.tags?.wikipedia || null
    };
  }
  const toIdea = p => ({ name: p.name, local: p.local, cat: p.cat, lat: p.lat, lng: p.lng, why: WHY[p.cat], website: p.website, wikidata: p.wikidata });

  function assignTimes(day) {
    let t = 9 * 60;
    day.stops.forEach((s, i) => {
      if (s.cat === "food" && t < 12.5 * 60 && t > 10.5 * 60) t = 12.5 * 60;
      if (s.cat === "night") t = Math.max(t, 20.5 * 60);
      t = Math.round(t / 15) * 15;
      s.time = fmtTime(t);
      const leg = day.legs?.[i];
      const walk = leg ? leg.s / 60 : (day.stops[i + 1] ? km(s, day.stops[i + 1]) / 4.5 * 60 : 0);
      t += (s._min || 60) + Math.min(walk, 40) + 10;
    });
  }

  async function computeRoute(day, signal) {
    const r = await svc.walkRoute(day.stops, signal);
    day.route = r?.line || null;
    day.legs = r?.legs || null;
    assignTimes(day);
    return day;
  }

  /* ---------- main entry ----------
     build() returns as soon as the places are chosen, so the traveler sees the trip fast.
     hydrate() then adds Hebrew names, Wikipedia stories and photos, walking routes and the AI layer in the background. */
  const POOL_KEY = "masa-pools";
  function cachedPool(key) { try { return (JSON.parse(localStorage.getItem(POOL_KEY) || "{}"))[key] || null; } catch { return null; } }
  function cachePool(key, els) {
    try {
      const all = JSON.parse(localStorage.getItem(POOL_KEY) || "{}");
      all[key] = { t: Date.now(), els };
      const keys = Object.keys(all).sort((x, y) => all[y].t - all[x].t);
      keys.slice(4).forEach(k => delete all[k]);
      localStorage.setItem(POOL_KEY, JSON.stringify(all));
    } catch {}
  }
  const KEEP = ["name", "name:he", "tourism", "historic", "amenity", "leisure", "natural", "shop", "building", "wikidata", "wikipedia", "website", "contact:website", "url", "opening_hours", "fee", "charge", "cuisine", "heritage", "wikimedia_commons", "image"];
  const slim = els => els.map(e => ({ type: e.type, id: e.id, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: Object.fromEntries(Object.entries(e.tags || {}).filter(([k]) => KEEP.includes(k))) }));

  async function build(opts, step, signal) {
    const { query, days, interests: rawInterests, budget, pace } = opts;
    const interests = rawInterests.length ? rawInterests : ["history", "view", "art", "food"];
    const chk = () => { if (signal?.aborted) throw { code: "cancelled" }; };

    step(0);
    const geo = opts.geo || await svc.geocode(query, signal);
    if (!geo) throw { code: "not_found" };
    chk();
    opts.onGeo?.(geo);

    step(1);
    let R = 3500;
    if (geo.bbox) R = Math.min(5000, Math.max(2000, km({ lat: geo.bbox.s, lng: geo.bbox.w }, { lat: geo.bbox.n, lng: geo.bbox.e }) * 1000 / 4.5));
    const pkey = `${geo.lat.toFixed(2)},${geo.lng.toFixed(2)}|${[...interests].sort().join(",")}`;
    let els = cachedPool(pkey)?.els;
    if (!els) {
      try { els = slim((await svc.overpass(buildQuery(geo.lat, geo.lng, R, interests), signal)).elements || []); }
      catch (e) { if (signal?.aborted) throw { code: "cancelled" }; throw { code: "network" }; }
      if (els.length) cachePool(pkey, els);
    }
    chk();
    const pool = normalize(els, geo, interests, geo.cc);

    step(2);
    const perDay = { "רגוע": 3, "מאוזן": 4, "אינטנסיבי": 5 }[pace] || 4;
    const sightsPool = pool.filter(p => !["food", "night"].includes(p.cat)).sort((a, b) => b.score - a.score);
    const chosen = pick(sightsPool, days * (perDay - 1));
    if (chosen.length < Math.min(3, days * 2)) throw { code: "too_few" };
    const used = new Set(chosen.map(p => p.osm));
    const groups = splitDays(chosen, days).map(orderDay);
    const foods = pool.filter(p => p.cat === "food").sort((a, b) => b.score - a.score);
    const bars = pool.filter(p => p.cat === "night").sort((a, b) => b.score - a.score);
    const nearBest = (list, anchor, maxKm) => {
      let best = null, bv = -Infinity;
      for (const f of list) {
        if (used.has(f.osm)) continue;
        const d = km(anchor, f);
        if (d > maxKm) continue;
        const v = f.score - 3 * d;
        if (v > bv) { bv = v; best = f; }
      }
      return best;
    };
    const dayStops = groups.map(g => {
      const list = [...g];
      const li = Math.min(2, list.length);
      const anchor = list[li - 1] || list[0];
      const lunch = nearBest(foods, anchor, 0.9) || nearBest(foods, anchor, 2.5);
      if (lunch) { used.add(lunch.osm); list.splice(li, 0, lunch); }
      if (interests.includes("night")) {
        const bar = nearBest(bars, list[list.length - 1], 1.2);
        if (bar) { used.add(bar.osm); list.push(bar); }
      }
      return list;
    });
    const stopsFlat = dayStops.flat();
    const nearbyOf = new Map();
    for (const s of stopsFlat) {
      if (s.cat === "food" || s.cat === "night") continue;
      const cands = pool.filter(p => !used.has(p.osm) && p.cat !== "night" && km(s, p) < 0.9 && (p.cat !== "food" || p.wikidata))
        .sort((a, b) => (b.score - 2 * km(s, b)) - (a.score - 2 * km(s, a))).slice(0, 2);
      cands.forEach(c => used.add(c.osm));
      nearbyOf.set(s.osm, cands);
    }
    const rest = pool.filter(p => !used.has(p.osm)).sort((a, b) => b.score - a.score);
    const take = (f, n) => { const out = []; for (const p of rest) { if (out.length >= n) break; if (!used.has(p.osm) && f(p)) { out.push(p); used.add(p.osm); } } return out; };
    const disc = {
      gems: take(p => p.wikidata && ["history", "art", "religion", "view"].includes(p.cat), 4),
      experiences: take(p => p.tags.amenity === "marketplace" || ["night", "family", "shopping"].includes(p.cat) || (p.cat === "food" && p.wikidata), 4),
      free: take(p => ["view", "nature", "religion"].includes(p.cat) && p.fee !== "yes", 3)
    };
    const idea = p => ({ ...toIdea(p), _wd: p.wikidata, _wiki: p.tags?.wikipedia || null });
    const trip = {
      city: geo.name, cityLocal: geo.local, country: geo.country, cc: geo.cc, lat: geo.lat, lng: geo.lng, source: "osm",
      createdAt: Date.now(), pending: true, opts: { ...opts, geo: undefined, onGeo: undefined, interests },
      summary: "",
      days: dayStops.map((list, i) => {
        const stops = list.map(p => {
          const s = toStop(p, budget);
          s.nearby = (nearbyOf.get(p.osm) || []).map(idea);
          return s;
        });
        const cats = [...new Set(stops.filter(s => s.cat !== "food").map(s => s.cat))].slice(0, 2).map(c => CATS[c].he);
        const d = { label: `יום ${i + 1}`, theme: cats.join(" ו"), stops, route: null, legs: null };
        assignTimes(d);
        return d;
      }),
      discover: {
        gems: disc.gems.map(idea), experiences: disc.experiences.map(idea), free: disc.free.map(idea), daytrips: [],
        dishes: [], phrases: PHRASES[COUNTRY_LANG[geo.cc] || "en"], etiquette: ETIQUETTE_GENERIC
      }
    };
    const n = stopsFlat.length;
    trip.summary = `${n} תחנות אמיתיות מ-OpenStreetMap, מסודרות למסלולי הליכה לפי ${interests.map(i => CATS[i]?.he).filter(Boolean).join(", ")}.`;
    return trip;
  }

  /* Fill in the slow parts. onUpdate(stage) is called after each one so the screen can refresh. */
  async function hydrate(trip, onUpdate) {
    const stops = trip.days.flatMap(d => d.stops);
    const ideas = [...stops.flatMap(s => s.nearby || []), ...["gems", "experiences", "free"].flatMap(k => trip.discover[k] || [])];
    // 1. walking routes (fast, one call per day, in parallel)
    const routes = Promise.all(trip.days.map(d => computeRoute(d))).then(() => onUpdate("routes"));
    // 2. Hebrew names + Wikipedia titles
    const wd = await svc.wikidata([...stops.map(s => s.wikidata), ...ideas.map(i => i._wd)].filter(Boolean));
    const apply = (o, id, wikiTag) => {
      const e = id && wd[id];
      if (e?.labelHe) o.name = e.labelHe;
      o._he = e?.hewiki || null; o._en = e?.enwiki || null;
      const wt = (wikiTag || "").match(/^(he|en):(.+)$/);
      if (wt && !o["_" + wt[1]]) o["_" + wt[1]] = wt[2];
      return e;
    };
    stops.forEach(s => { const e = apply(s, s.wikidata, s._wikiTag); if (e?.descHe) s.why = e.descHe.replace(/^./, c => c.toUpperCase()).replace(/\.?$/, "."); });
    ideas.forEach(i => { const e = apply(i, i._wd, i._wiki); if (e?.descHe) i.why = e.descHe.replace(/\.?$/, "."); });
    onUpdate("names");
    // 3. stories + photos, in route order so the first stops fill first
    await svc.mapLimit(stops, 5, async s => {
      const sum = (s._he && await svc.wikiSummary("he", s._he)) || (s._en && await svc.wikiSummary("en", s._en));
      if (sum) {
        if (!s.histAI) { s.history = firstSentences(sum.extract, 700); s.histLang = sum.lang; }
        s.wikiUrl = sum.url;
        s.image = sum.image;
        onUpdate("story");
      }
    });
    await routes;
    // 4. optional AI layer
    if (Masa.ai.enabled()) {
      onUpdate("ai-start");
      try { await enrichWithAI(trip, trip.opts || {}); }
      catch (e) { trip.aiError = e.code || "ai_error"; }
    }
    trip.pending = false;
    onUpdate("done");
    return trip;
  }

  /* The AI only writes text about places that already exist on the map. It never adds coordinates. */
  async function enrichWithAI(trip, opts) {
    const stops = trip.days.flatMap((d, di) => d.stops.map(s => ({ s, di })));
    const list = stops.map(({ s, di }, i) => ({ i, day: di + 1, name: s.name, local: s.local, cat: s.cat, source: (s.history || "").slice(0, 300) }));
    const prompt = `You are an expert local tour guide and historian in ${trip.cityLocal}, ${trip.country}. A traveler plans ${trip.days.length} days. Interests: ${(opts.interests || []).join(", ")}. Budget: ${opts.budget}. Pace: ${opts.pace}. Notes: ${opts.notes || "none"}.
These are REAL places already on the route (from OpenStreetMap). "source" is a Wikipedia excerpt when available; use it as the factual basis and do not invent facts you are not sure about.
${JSON.stringify(list)}

Write everything in natural Hebrew. Reply with only JSON:
{"summary":"1-2 sentences about this trip",
 "days":[{"theme":"short theme for each day, in order"}],
 "stops":[{"i":0,"why":"one sentence why to go","history":"2-4 sentences, the real story like a guide speaking (dates, people, what to look for). For a restaurant or market, the story of the neighborhood or the dish","fact":"one surprising true sentence","tip":"one practical tip","best":"best time to visit, short","busy":[16 integers 0-100, typical crowd per hour 07:00..22:00, 0=closed],"booking_needed":true,"booking_steps":["2-4 short steps; name the official seller, never invent URLs"]}],
 "dishes":[6 x {"name":"Hebrew","local":"local name","why":"one sentence"}],
 "experiences":[3 x {"name":"Hebrew","local":"local name for web search","why":"one sentence"}],
 "daytrips":[2 x {"name":"Hebrew","local":"local name","why":"one sentence including travel time"}],
 "etiquette":[4 short local customs tips]}`;
    const r = await Masa.ai.json(prompt);
    if (r.summary) trip.summary = r.summary;
    (r.days || []).forEach((d, i) => { if (trip.days[i] && d?.theme) trip.days[i].theme = d.theme; });
    (r.stops || []).forEach(x => {
      const ref = stops[+x.i];
      if (!ref) return;
      const s = ref.s;
      if (x.why) s.why = x.why;
      if (x.history && (!s.history || s.histLang !== "he")) { s.history = x.history; s.histLang = "he"; s.histAI = true; }
      if (x.fact) s.fact = x.fact;
      if (x.tip) s.tip = x.tip;
      if (x.best) s.best = x.best;
      if (Array.isArray(x.busy) && x.busy.length >= 12) { s.busy = Array.from({ length: 16 }, (_, k) => Math.max(0, Math.min(100, Math.round(+x.busy[k] || 0)))); s.busySrc = "ai"; }
      if (Array.isArray(x.booking_steps) && x.booking_steps.length) {
        s.booking = { ...s.booking, needed: !!x.booking_needed || s.booking.needed, steps: x.booking_steps.map(String) };
      }
    });
    const D = trip.discover;
    if (Array.isArray(r.dishes)) D.dishes = r.dishes.slice(0, 6);
    if (Array.isArray(r.experiences)) D.experiences = [...D.experiences, ...r.experiences.map(x => ({ ...x, cat: "food", lat: null, lng: null }))].slice(0, 6);
    if (Array.isArray(r.daytrips)) D.daytrips = r.daytrips.map(x => ({ ...x, cat: "nature", lat: null, lng: null }));
    if (Array.isArray(r.etiquette) && r.etiquette.length) D.etiquette = r.etiquette.slice(0, 5);
    trip.ai = true;
  }

  return { build, hydrate, computeRoute, assignTimes, km, BUSY, HOURS: 16 };
})();
