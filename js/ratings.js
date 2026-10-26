/* מסע · restaurant ratings from the Tripadvisor Content API, so meals in the trip are places rated 4.5 and up.
   Tripadvisor's rules: only the location id may be stored; ratings, names and reviews are fetched live and kept in memory
   only, and every rating is shown with Tripadvisor's own image and a link to the place on Tripadvisor.
   So: restaurants come from our own map data, Tripadvisor only says how good they are. A meal is replaced only by a
   restaurant that is also in our data (with our name and position), never by a name taken from Tripadvisor.
   The free plan is 5,000 calls a month: a trip uses about 3 calls per meal at most, and a busy or exhausted key
   (429) simply turns the ratings off until the page is reloaded. */
window.Masa = window.Masa || {};
Masa.ratings = (() => {
  "use strict";
  const testing = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem("masa-ta-test") === "1"; } catch { return false; } })();
  const CFG = window.MASA_TA || (testing ? { proxy: location.origin + "/__ta" } : null);
  const MIN = 4.5, MIN_REVIEWS = 30, PER_MEAL = 3, PER_TRIP = 30;
  const enabled = () => !!(CFG && (CFG.key || CFG.proxy)) && !off;
  let off = false;
  const base = () => (CFG.proxy || "https://api.content.tripadvisor.com/api/v1").replace(/\/$/, "");
  async function call(path, params) {
    if (!enabled()) throw new Error("off");
    const u = new URL(base() + path);
    if (!CFG.proxy) u.searchParams.set("key", CFG.key);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    const r = await fetch(u.toString(), { headers: { accept: "application/json" } });
    if (r.status === 429 || r.status === 401 || r.status === 403) { off = true; throw new Error("ta " + r.status); }
    if (!r.ok) throw new Error("ta " + r.status);
    return r.json();
  }
  /* location ids may be kept (Tripadvisor allows it): our place -> their id, 0 when they do not have it */
  const IDS_KEY = "masa-ta-ids";
  const ids = (() => { try { return JSON.parse(localStorage.getItem(IDS_KEY) || "{}"); } catch { return {}; } })();
  const saveIds = () => { try { const k = Object.keys(ids); if (k.length > 3000) k.slice(0, k.length - 3000).forEach(x => delete ids[x]); localStorage.setItem(IDS_KEY, JSON.stringify(ids)); } catch {} };
  const placeKey = p => p.osm || p.id || `${String(p.local || p.name).toLowerCase()}@${(+p.lat).toFixed(3)},${(+p.lng).toFixed(3)}`;
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const sameName = (a, b) => {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x.includes(y) || y.includes(x)) return true;
    const A = x.split(" ").filter(w => w.length > 2 && !/^(restaurant|ristorante|trattoria|osteria|cafe|caffe|bar|the|and|da|di|de|la|le)$/.test(w)), B = new Set(y.split(" "));
    return A.length > 0 && A.filter(w => B.has(w)).length / A.length >= 0.5;
  };
  /* ratings live only here, for this visit */
  const live = new Map();
  let used = 0;
  const budgetLeft = () => used < PER_TRIP;
  async function details(id) {
    if (live.has(id)) return live.get(id);
    used++;
    const j = await call(`/location/${id}/details`, { language: "en", currency: "EUR" });
    const d = { id, rating: +j.rating || 0, count: +j.num_reviews || 0, url: j.web_url || "", img: j.rating_image_url || "", lat: +j.latitude, lng: +j.longitude, name: j.name || "" };
    live.set(id, d);
    return d;
  }
  const nearbyCache = new Map();
  async function nearby(lat, lng) {
    const k = `${(+lat).toFixed(3)},${(+lng).toFixed(3)}`;
    if (nearbyCache.has(k)) return nearbyCache.get(k);
    used++;
    const j = await call("/location/nearby_search", { latLong: `${lat},${lng}`, category: "restaurants", language: "en", radius: "0.7", radiusUnit: "km" });
    const list = (j.data || []).map(x => ({ id: String(x.location_id), name: x.name || "", dist: parseFloat(x.distance) || 0 }));
    nearbyCache.set(k, list);
    return list;
  }
  async function idFor(p) {
    const k = placeKey(p);
    if (k in ids) return ids[k];
    const list = await nearby(p.lat, p.lng);
    const m = list.find(x => sameName(x.name, p.local || p.name) && x.dist < 0.3);
    ids[k] = m ? m.id : 0; saveIds();
    return ids[k];
  }
  /* the rating of a place for showing (one or two calls, then from memory) */
  async function ratingOf(p) {
    if (!enabled()) return null;
    try { const id = await idFor(p); return id ? await details(id) : null; } catch { return null; }
  }
  const known = p => { const id = ids[placeKey(p)]; return id ? live.get(id) || null : null; };

  /* make each lunch and dinner a restaurant rated 4.5+ (and with enough reviews), from our own list of places.
     replace(dayIndex, stopIndex, place) swaps it into the trip; it is given by the app. */
  async function checkMeals(trip, replace, onChange) {
    if (!enabled()) return { checked: 0, replaced: 0 };
    used = 0;
    let checked = 0, replaced = 0;
    const inTrip = new Set(trip.days.flatMap(d => d.stops.map(s => s.osm || s.name)));
    const pool = (trip.places || []).filter(p => p.kind === "restaurant");
    for (let di = 0; di < trip.days.length; di++) {
      const day = trip.days[di];
      for (let si = 0; si < day.stops.length; si++) {
        const s = day.stops[si];
        if (!["lunch", "dinner"].includes(s.meal) || s._ratingChecked) continue;
        if (!budgetLeft() || !enabled()) return { checked, replaced };
        s._ratingChecked = true;
        checked++;
        try {
          const cur = await ratingOf(s);
          if (cur && cur.rating >= MIN && cur.count >= MIN_REVIEWS) { onChange?.(); continue; }
          // look for a better restaurant around the same spot, among the ones we have on our own map
          const near = await nearby(s.lat, s.lng);
          let tries = 0;
          for (const x of near) {
            if (tries >= PER_MEAL || !budgetLeft()) break;
            const ours = pool.find(p => !inTrip.has(p.id) && !inTrip.has(p.name) && sameName(p.local || p.name, x.name) && Math.abs(Masa.planner.km(p, s) - x.dist) < 0.35);
            if (!ours) continue;
            tries++;
            const d = await details(x.id);
            ids[placeKey(ours)] = x.id; saveIds();
            if (d.rating >= MIN && d.count >= MIN_REVIEWS && Masa.planner.km(ours, d) < 0.2) {
              replace(di, si, ours);
              inTrip.add(ours.id);
              day.stops[si]._ratingChecked = true;
              replaced++;
              onChange?.();
              break;
            }
          }
        } catch { if (!enabled()) return { checked, replaced }; }
      }
    }
    return { checked, replaced };
  }
  /* what Tripadvisor asks for: their rating image, the number of reviews and a link to the place */
  const badge = (r, esc, link = true) => {
    if (!r) return "";
    const inner = `${r.img ? `<img src="${esc(r.img)}" alt="דירוג Tripadvisor ${r.rating}" height="14">` : ""}<span>${r.rating.toFixed(1)}</span><small>${r.count.toLocaleString("he-IL")} ביקורות ב-Tripadvisor</small>`;
    return link && r.url ? `<a class="tabadge" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<span class="tabadge">${inner}</span>`;
  };

  return { enabled, ratingOf, known, checkMeals, badge, MIN };
})();
