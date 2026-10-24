/* מסע · app: Leaflet map + app screens */
(() => {
"use strict";
const { P, CATS, INTERESTS, DAYC, DESTS, SAMPLE, PHRASES, ETIQUETTE_GENERIC, COUNTRY_INFO } = window.MASA_DATA;
const svc = Masa.svc, ai = Masa.ai, planner = Masa.planner;

/* ---------- helpers ---------- */
const ic = (n, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.pin}</svg>`;
const cv = n => `var(${n})`;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const km = planner.km;
const hasXY = s => s && s.lat != null && s.lng != null && isFinite(+s.lat) && isFinite(+s.lng);
const catOf = s => CATS[s?.cat] ? s.cat : "view";
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const cityQ = () => S.trip?.cityLocal || S.trip?.city || "";
const gmPlace = s => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.local || s.name}, ${cityQ()}`)}`;
const gmDir = (a, b, mode = "walking") => `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;
const gSearch = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
let toastT = null;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }

/* ---------- dates ---------- */
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function tripDates(t = S.trip) {
  const o = t?.opts || S.form;
  const start = o.start ? new Date(o.start + "T12:00:00") : addDays(new Date(), 21);
  return { start, end: addDays(start, o.days || t?.days?.length || 3), people: o.people || 2 };
}
const fmtDay = d => d.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" });

/* ---------- state ---------- */
const S = {
  screen: "home", prev: "home", dest: null,
  form: { days: 3, interests: ["food", "history", "view"], budget: "בינוני", pace: "מאוזן", diet: "הכול", mobility: "", move: "walk", notes: "", start: isoDate(addDays(new Date(), 21)), people: 2 },
  list: { chip: "food", sort: "best", open: false, cuisine: null, price: null, diet: null, q: "", page: 1 }, poi: null,
  trip: null, day: 0, stop: 0, openBook: null, chat: [], chatLog: [], busy: false, me: null
};
let checks = store.get("masa-checks", {});
const ckey = (s, i) => `${S.trip?.city}|${s.name}|${i}`;
const TRIP_SCREENS = ["plan", "place", "book", "guide", "discover", "list", "poi", "info", "move"];

/* ---------- speech (built into the browser, free) ---------- */
const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
let speaking = null;
function voiceFor(lang) { try { const vs = speechSynthesis.getVoices(); return vs.find(v => v.lang === lang) || vs.find(v => v.lang?.slice(0, 2) === lang.slice(0, 2)); } catch { return null; } }
function speak(text, lang, id, onEnd) {
  if (!canSpeak) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; const v = voiceFor(lang); if (v) u.voice = v; u.rate = lang.startsWith("he") ? 1 : .9;
    u.onend = u.onerror = () => { if (speaking === id) speaking = null; onEnd?.(); };
    speaking = id; speechSynthesis.speak(u); return true;
  } catch { return false; }
}
function stopSpeak() { try { speechSynthesis.cancel(); } catch {} speaking = null; }
if (canSpeak) { try { speechSynthesis.getVoices(); } catch {} }

/* ---------- map: 3D globe (MapLibre) ----------
   From far away: a satellite globe in space. Zooming into a city: the satellite fades into a street map. */
let reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SAT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const FALLBACK_STYLE = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#e8ecef" } }, { id: "osm", type: "raster", source: "osm" }]
};
const isMobile = () => innerWidth <= 760;
const WORLD = () => ({ center: [25, 28], zoom: isMobile() ? 0.9 : 1.6 });
const map = new maplibregl.Map({ container: "map", style: STREET_STYLE, ...WORLD(), attributionControl: false, maxPitch: 60, renderWorldCopies: false });
map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · Imagery © Esri, Maxar, Earthstar Geographics' }), "bottom-left");
let mapReady = false, styleFailed = false;
const EMPTY = { type: "FeatureCollection", features: [] };
map.on("error", e => {
  if (!mapReady && !styleFailed && /style|liberty|openfreemap/i.test(String(e?.error?.message || e?.error?.url || ""))) { styleFailed = true; map.setStyle(FALLBACK_STYLE); }
});
setTimeout(() => { if (!mapReady && !styleFailed) { styleFailed = true; map.setStyle(FALLBACK_STYLE); } }, 9000);
map.on("style.load", () => {
  try { map.setProjection({ type: "globe" }); } catch {}
  try { map.setSky({ "sky-color": "#0a1a36", "horizon-color": "#8fc1ff", "fog-color": "#dfeeff", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0] }); } catch {}
  const firstSymbol = map.getStyle().layers.find(l => l.type === "symbol")?.id;
  if (!map.getSource("sat")) {
    map.addSource("sat", { type: "raster", tiles: [SAT_TILES], tileSize: 256, maxzoom: 18 });
    map.addLayer({ id: "sat", type: "raster", source: "sat", paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 1, 13, 0], "raster-fade-duration": 250 } }, firstSymbol);
  }
  if (!map.getSource("route")) {
    map.addSource("route", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": .9 } });
    map.addLayer({ id: "route-line", type: "line", source: "route", filter: ["!", ["get", "straight"]], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } });
    map.addLayer({ id: "route-dash", type: "line", source: "route", filter: ["get", "straight"], layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4, "line-dasharray": [2, 2] } });
  }
  try {
    const bg = map.getStyle().layers.find(l => l.type === "background");
    if (bg) map.setPaintProperty(bg.id, "background-color", ["interpolate", ["linear"], ["zoom"], 0, "#123a63", 6, "#123a63", 8, map.getPaintProperty(bg.id, "background-color") || "#f2efe9"]);
  } catch {}
  mapReady = true;
  renderMap();
});

function padding() {
  if (isMobile()) {
    const ph = $("panel").classList.contains("collapsed") ? 132 : innerHeight * 0.6;
    return { top: 90, bottom: ph + 24, left: 30, right: 30 };
  }
  return { top: 90, bottom: 50, left: 80, right: 470 };
}
function flyCenter(p, z, ms) {
  const far = map.getZoom() < 6 && z > 9;
  const o = { center: [+p.lng, +p.lat], zoom: z, padding: padding(), essential: true };
  try { reduced ? map.jumpTo(o) : map.flyTo({ ...o, duration: ms || (far ? 3200 : 1300), curve: far ? 1.6 : 1.42 }); }
  catch { try { map.jumpTo({ center: o.center, zoom: z }); } catch {} }
}
function fitPoints(pts, maxZoom = 16) {
  pts = pts.filter(hasXY);
  if (!pts.length) return;
  if (pts.length === 1) return flyCenter(pts[0], Math.min(maxZoom, 16));
  const b = new maplibregl.LngLatBounds();
  pts.forEach(p => b.extend([+p.lng, +p.lat]));
  const far = map.getZoom() < 6;
  let cam = null;
  try { cam = map.cameraForBounds(b, { padding: padding(), maxZoom }); } catch {}
  if (!cam || !cam.center || !isFinite(cam.zoom)) {
    const c = b.getCenter();
    return flyCenter({ lat: c.lat, lng: c.lng }, Math.min(maxZoom, 14));
  }
  const o = { center: cam.center, zoom: cam.zoom, padding: padding(), essential: true };
  try { reduced ? map.jumpTo(o) : map.flyTo({ ...o, duration: far ? 3200 : 1300, curve: far ? 1.6 : 1.42 }); }
  catch { try { map.jumpTo(o); } catch {} }
}

/* markers are plain HTML so Hebrew labels render perfectly */
let markers = [];
const node = (cls, html) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; };
function addMarker(p, el, opts = {}, onClick) {
  const m = new maplibregl.Marker({ element: el, anchor: opts.anchor || "bottom", offset: opts.offset || [0, 0] }).setLngLat([+p.lng, +p.lat]).addTo(map);
  if (onClick) { el.style.cursor = "pointer"; el.addEventListener("click", e => { e.stopPropagation(); onClick(); }); }
  if (opts.z) el.style.zIndex = opts.z;
  markers.push(m);
  return m;
}
const pinNode = (fill, dc, text, label, big) => node(`mk pinmk${big ? " on" : ""}`, `<span class="mk-label">${esc(label)}</span><span class="pinbox" style="--s:${big ? 38 : 30}px"><span class="pin${big ? " big" : ""}" style="--c:${fill};--dc:${dc}"><span>${text}</span></span></span>`);
const dotNode = (fill, label, cls = "") => node(`mk dotmk ${cls}`, `${label ? `<span class="mk-label">${esc(label)}</span>` : ""}<i style="--c:${fill}"></i>`);

function setRoute(features) { if (mapReady && map.getSource("route")) map.getSource("route").setData({ type: "FeatureCollection", features }); }
function renderMap() {
  markers.forEach(m => m.remove());
  markers = [];
  const C = n => css(n);
  const inTrip = S.trip && TRIP_SCREENS.includes(S.screen);
  if (!inTrip) {
    setRoute([]);
    DESTS.forEach(d => addMarker(d, dotNode(C(d.grad[0]), d.he, "destmk" + (S.dest?.q === d.q ? " sel" : "")), { offset: [0, 7] }, () => pickDest(d)));
    if (S.dest && hasXY(S.dest) && !DESTS.some(d => d.q === S.dest.q)) addMarker(S.dest, dotNode(C("--coral"), S.dest.he, "destmk sel"), { offset: [0, 7] });
    if (S.me) addMarker(S.me, node("me-dot", ""), { anchor: "center" });
    return;
  }
  const t = S.trip;
  if (S.screen === "list" || S.screen === "poi") {
    setRoute([]);
    const items = S.screen === "poi" && S.poi ? [S.poi] : listItems().slice(0, 60);
    items.filter(hasXY).forEach((p, i) => {
      const sel = S.screen === "poi";
      addMarker(p, node(`mk gpin${sel ? " on" : ""}`, `<span class="mk-label">${esc(p.name)}</span><span class="gpinbody" style="--c:${C(CATS[catOf(p)].c)}">${ic(CHIP_ICON[p.kind] || catOf(p), 2.2)}</span>`),
        { z: sel ? 5 : 2 }, () => { S.poi = p; go("poi"); });
    });
    if (S.screen === "list" && S.list.chip === "hotel" && !S.list.q) addMarker(tripCenter(), node("mk centermk", `<span class="mk-label">מרכז המסלול</span><i>★</i>`), { anchor: "center", z: 7 });
    if (S.me) addMarker(S.me, node("me-dot", ""), { anchor: "center", z: 6 });
    syncLabels();
    return;
  }
  const d = t.days[S.day], dc = C(DAYC[S.day % 5]);
  const line = d.route?.length > 1 ? d.route : d.stops.filter(hasXY).map(s => [s.lat, s.lng]);
  setRoute(line.length > 1 ? [{ type: "Feature", properties: { color: dc, straight: !d.route }, geometry: { type: "LineString", coordinates: line.map(([la, ln]) => [ln, la]) } }] : []);
  t.days.forEach((dd, di) => {
    if (di === S.day) return;
    dd.stops.forEach((s, si) => { if (hasXY(s)) addMarker(s, dotNode(C(DAYC[di % 5]), "", "faint"), { anchor: "center" }, () => { S.day = di; S.stop = si; go("place"); }); });
  });
  if (S.screen === "place") {
    (d.stops[S.stop].nearby || []).filter(hasXY).forEach(n => addMarker(n, dotNode(C("--violet"), n.name, "hollow"), { offset: [0, 8] }));
  }
  if (S.screen === "discover" && t.discover) {
    discItems().filter(hasXY).forEach(it => addMarker(it, node("mk diamk", `<span class="mk-label">${esc(it.name)}</span><i style="--c:${C(CATS[catOf(it)].c)}"></i>`), { offset: [0, 9] },
      () => document.querySelector(`[data-did="${CSS.escape(it.name)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })));
  }
  d.stops.forEach((s, i) => {
    if (!hasXY(s)) return;
    const on = S.screen === "place" && i === S.stop;
    addMarker(s, pinNode(C(CATS[catOf(s)].c), dc, i + 1, s.name, on), { z: on ? 5 : 2 }, () => { S.stop = i; go("place"); });
  });
  if (S.me) addMarker(S.me, node("me-dot", ""), { anchor: "center", z: 6 });
  syncLabels();
}
const syncLabels = () => map.getContainer().classList.toggle("hide-labels", map.getZoom() < 13.2);
map.on("zoom", syncLabels);


/* slow spin on the home screen, like a globe on a desk */
let spinning = true, interacting = false;
function spin() {
  if (!spinning || interacting || reduced || S.screen !== "home" || S.dest || map.getZoom() > 3.2) return;
  const c = map.getCenter();
  map.easeTo({ center: [c.lng - 12, c.lat], duration: 4000, easing: x => x, essential: true });
}
map.on("mousedown", () => { interacting = true; spinning = false; });
map.on("touchstart", () => { interacting = true; spinning = false; });
map.on("moveend", () => { interacting = false; spin(); });
map.on("load", () => setTimeout(spin, 600));

/* the traveler's own location (asked only when they tap the button) */
function locate() {
  if (!navigator.geolocation) { toast("הדפדפן הזה לא תומך במיקום"); return; }
  navigator.geolocation.getCurrentPosition(p => {
    S.me = { lat: p.coords.latitude, lng: p.coords.longitude };
    autoVisited();
    renderMap();
    flyCenter(S.me, 16);
  }, () => toast("לא הצלחנו לקבל מיקום. בדקו שהרשאת המיקום פתוחה בדפדפן."), { enableHighAccuracy: true, timeout: 12000 });
}
const flyWorld = () => { const w = WORLD(); reduced ? map.jumpTo({ ...w, padding: padding() }) : map.flyTo({ ...w, padding: padding(), duration: 2600, essential: true }); };

$("zin").onclick = () => map.zoomIn();
$("zout").onclick = () => map.zoomOut();
$("zworld").onclick = flyWorld;
$("zfit").onclick = () => { if (S.trip && TRIP_SCREENS.includes(S.screen)) fitPoints(S.trip.days[S.day].stops); else if (S.dest && hasXY(S.dest)) flyCenter(S.dest, 11); };
$("zme").onclick = locate;
$("gearBtn").onclick = () => { if (S.screen !== "settings") { S.prev = S.screen; go("settings"); } };
$("handle").onclick = () => { $("panel").classList.toggle("collapsed"); setTimeout(() => map.resize(), 300); };
addEventListener("resize", () => map.resize());
const rethemed = () => renderMap();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rethemed);
new MutationObserver(rethemed).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* ---------- navigation ---------- */
function go(screen, opts = {}) {
  if (!["list", "poi"].includes(screen)) S.replace = null;
  if (screen !== "place" && screen !== "discover") stopSpeak();
  S.screen = screen;
  renderPanel();
  renderMap();
  renderChips();
  if (!S.trip || !TRIP_SCREENS.includes(screen)) { if (isMobile()) $("panel").classList.remove("collapsed"); return; }
  if (screen === "plan" && !opts.noFly) fitPoints(S.trip.days[S.day].stops);
  if (screen === "place") { const s = S.trip.days[S.day].stops[S.stop]; fitPoints([s, ...(s.nearby || [])], 17); }
  if (screen === "discover" && !opts.noFly) fitPoints([...S.trip.days.flatMap(d => d.stops), ...discItems()], 15);
  if (screen === "list" && !opts.noFly) { const it = listItems().slice(0, 25); if (it.length) fitPoints(it, 16); }
  if (screen === "poi" && S.poi) flyCenter(S.poi, 16.5);
  if (isMobile()) $("panel").classList.remove("collapsed");
}
function pickDest(d) { S.dest = d; const inp = $("destInput"); if (inp) inp.value = d.q; flyCenter(d, 11); renderMap(); }
function setNav() {
  const nav = $("nav");
  const show = !!S.trip && TRIP_SCREENS.includes(S.screen);
  nav.hidden = !show;
  if (!show) return;
  const pending = S.trip.days.flatMap(d => d.stops).filter(s => s.booking?.needed && !(s.booking.steps || []).every((_, i) => checks[ckey(s, i)])).length;
  const items = [["plan", "route", "מסלול"], ["discover", "compass", "גלו"], ["book", "ticket", "הזמנות"], ["guide", "chat", "מדריך"], ["home", "home", "בית"]];
  nav.innerHTML = items.map(([k, i, l]) => `<button type="button" data-k="${k}" aria-current="${S.screen === k || (k === "plan" && S.screen === "place") || (k === "discover" && (S.screen === "list" || S.screen === "poi"))}">${ic(i)}${l}${k === "book" && pending ? `<span class="badge">${pending}</span>` : ""}</button>`).join("");
  nav.querySelectorAll("button").forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === "home") { stopSpeak(); S.screen = "home"; S.dest = null; renderPanel(); renderMap(); renderChips(); flyWorld(); }
    else go(k);
  });
}
const SCREENS = {};
function renderPanel() {
  $("composerSlot").innerHTML = "";
  $("screen").innerHTML = SCREENS[S.screen].view();
  SCREENS[S.screen].bind?.();
  setNav();
  $("scroll").scrollTop = 0;
}
function rerenderKeepScroll() { const k = $("scroll").scrollTop; renderPanel(); $("scroll").scrollTop = k; }

/* ---------- saved trips ---------- */
const savedTrips = () => store.get("masa-trips", []);
function saveTrip(t) {
  if (t.source === "sample") return;
  const list = savedTrips().filter(x => x.id !== t.id);
  t.id = t.id || `t${Date.now()}`;
  list.unshift(t);
  store.set("masa-trips", list.slice(0, 8));
}
function openTrip(t) {
  S.trip = t; S.day = 0; S.stop = 0; S.chat = []; S.chatLog = [];
  COST.loadFX(COUNTRY_INFO[t.cc]?.cur || "EUR").then(() => { if (S.trip === t && TRIP_SCREENS.includes(S.screen) && S.screen !== "guide") rerenderKeepScroll(); }).catch(() => {});
  go("plan");
  if (t.source === "sample") hydrateSample(t);
  else if (t.pending) runHydrate(t);
}
let refreshT = null;
function refreshSoon() {
  clearTimeout(refreshT);
  refreshT = setTimeout(() => {
    if (!S.trip || !TRIP_SCREENS.includes(S.screen)) return;
    renderMap();
    if (S.screen !== "guide") rerenderKeepScroll();
  }, 300);
}
const hydrating = new Set();
function runHydrate(t) {
  if (hydrating.has(t)) return;
  hydrating.add(t);
  planner.hydrate(t, stage => {
    if (stage === "done") {
      hydrating.delete(t);
      saveTrip(t);
      if (t.aiError && S.trip === t) toast(ai.errText(t.aiError));
    }
    if (S.trip === t) refreshSoon();
    if (stage === "routes" && S.trip === t && S.screen === "plan") setTimeout(() => fitPoints(t.days[S.day].stops), 350);
  }).catch(() => { hydrating.delete(t); t.pending = false; if (S.trip === t) refreshSoon(); });
}
function loadSample() { openTrip(JSON.parse(JSON.stringify(SAMPLE))); }
/* the sample has hand-written Hebrew stories; fetch photos and walking routes live */
function hydrateSample(t) {
  t.days.forEach(d => d.stops.forEach(s => {
    if (s.image || !s.wikiEn) return;
    svc.wikiSummary("en", s.wikiEn).then(r => {
      if (!r || S.trip !== t) return;
      s.image = r.image; s.wikiUrl = s.wikiUrl || r.url;
      if (S.screen === "place" && t.days[S.day].stops[S.stop] === s) rerenderKeepScroll();
    });
  }));
  t.days.forEach(d => svc.walkRoute(d.stops).then(r => {
    if (!r || S.trip !== t) return;
    d.route = r.line; d.legs = r.legs;
    if (TRIP_SCREENS.includes(S.screen)) { renderMap(); if (S.screen === "plan") rerenderKeepScroll(); }
  }));
}

/* ================= screens ================= */
SCREENS.home = {
  view() {
    const saved = savedTrips();
    return `<div class="screen">
    <div><div class="eyebrow">שלב 1 מתוך 3</div><h1 style="margin-top:4px">לאן נוסעים?</h1><p class="lead" style="margin-top:6px">כתבו יעד או בחרו נקודה על המפה. נבנה לכם מסלול ממקומות אמיתיים, לפי הימים ומה שמעניין אתכם.</p></div>
    <form class="search" id="destForm">${ic("search")}<input id="destInput" type="text" placeholder="עיר ומדינה, למשל ליסבון, פורטוגל" value="${esc(S.dest?.q || "")}" aria-label="יעד" autocomplete="off"><button class="btn" type="submit">המשך ${ic("fwd")}</button></form>
    <div class="status" id="destStatus"></div>
    ${saved.length ? `<div class="section-label">הטיולים שלי</div><div class="saved">${saved.map((t, i) => `<button type="button" class="savedtrip" data-i="${i}"><span class="ic" style="background:${cv(DAYC[i % 5])}">${ic("save")}</span><span><b>${esc(t.city)}</b><small>${t.days.length} ימים · ${t.days.reduce((a, d) => a + d.stops.length, 0)} תחנות</small></span>${ic("fwd")}</button>`).join("")}</div>` : ""}
    <div class="section-label">יעדים פופולריים</div>
    <div class="dests">${DESTS.slice(0, 8).map((d, i) => `<button type="button" class="dest" data-i="${i}" style="background:linear-gradient(135deg,${cv(d.grad[0])},${cv(d.grad[1])})"><small>${esc(d.country)}</small><span><b>${esc(d.he)}</b><br><small>${esc(d.days)} מומלצים</small></span></button>`).join("")}</div>
    <button type="button" class="btn soft block" id="sampleBtn">${ic("sparkle")} הצגת טיול לדוגמה: 3 ימים ברומא</button>
    <div class="trustlist">
      <div>${ic("pin")}<span><b>מקומות אמיתיים.</b> כל תחנה מגיעה מ-OpenStreetMap, עם מיקום מדויק ושעות פתיחה כשיש.</span></div>
      <div>${ic("book")}<span><b>הסיפור של כל מקום.</b> היסטוריה ותמונות מוויקיפדיה, ואפשר להאזין בזמן ההליכה.</span></div>
      <div>${ic("users")}<span><b>מתי פחות עמוס.</b> הערכת עומס לפי שעה והשעה הכי טובה להגיע.</span></div>
      <div>${ic("shield")}<span><b>הזמנות רק במקור.</b> קישור לאתר הרשמי של המקום, בלי עמלות.</span></div>
    </div></div>`;
  },
  bind() {
    document.querySelectorAll(".dest").forEach(b => b.onclick = () => pickDest(DESTS[+b.dataset.i]));
    document.querySelectorAll(".savedtrip").forEach(b => b.onclick = () => openTrip(savedTrips()[+b.dataset.i]));
    $("destForm").onsubmit = e => {
      e.preventDefault();
      const v = $("destInput").value.trim();
      if (!v) { $("destStatus").textContent = "כתבו לאן אתם נוסעים כדי להמשיך."; $("destInput").focus(); return; }
      const known = DESTS.find(d => v.includes(d.he));
      S.dest = known || { q: v, he: v.split(",")[0].trim() };
      if (known) flyCenter(known, 11);
      go("goals");
    };
    $("sampleBtn").onclick = loadSample;
  }
};

SCREENS.goals = {
  view() {
    const f = S.form;
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backHome" aria-label="חזרה">${ic("back")}</button><div class="eyebrow">שלב 2 מתוך 3</div><span style="width:38px"></span></div>
    <div><h1>מה בא לכם לעשות ב${esc(S.dest?.he || "יעד")}?</h1><p class="lead" style="margin-top:6px">ככל שתספרו יותר, המסלול יתאים לכם יותר.</p></div>
    <div class="section-label">כמה ימים</div>
    <div class="stepper"><button type="button" class="iconbtn" id="dminus" aria-label="פחות ימים" style="background:var(--surface)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button><output id="dval">${f.days === 1 ? "יום אחד" : f.days + " ימים"}</output><button type="button" class="iconbtn" id="dplus" aria-label="יותר ימים" style="background:var(--surface)">${ic("plus", 2.4)}</button></div>
    <div class="twocol">
      <label class="field"><span class="section-label">תאריך הגעה</span><input type="date" id="startDate" class="select" value="${esc(f.start || "")}"></label>
      <label class="field"><span class="section-label">מטיילים</span><span class="stepper small"><button type="button" class="iconbtn" id="pminus" aria-label="פחות מטיילים" style="background:var(--surface)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button><output id="pval">${f.people}</output><button type="button" class="iconbtn" id="pplus" aria-label="יותר מטיילים" style="background:var(--surface)">${ic("plus", 2.4)}</button></span></label>
    </div>
    <div class="section-label">מה הכי חשוב לכם? <small class="muted">נבנה תמהיל, והדברים שבחרתם יקבלו את רוב הזמן</small></div>
    <div class="tiles">${INTERESTS.map(k => `<button type="button" class="tile" data-k="${k}" aria-pressed="${f.interests.includes(k)}"><span class="ic" style="background:${cv(CATS[k].c)}">${ic(k)}</span>${CATS[k].he}</button>`).join("")}</div>
    <div class="section-label">תקציב</div>
    <div class="seg" id="budget">${["חסכוני", "בינוני", "מפנק"].map(v => `<button type="button" aria-pressed="${f.budget === v}">${v}</button>`).join("")}</div>
    <div class="section-label">אוכל</div>
    <div class="seg" id="diet">${["הכול", "צמחוני", "כשר"].map(v => `<button type="button" aria-pressed="${f.diet === v}">${v}</button>`).join("")}</div>
    <div class="section-label">איך מתניידים? <small class="muted">ברגל כל יום נשאר באזור אחד, ברכב אפשר להגיע רחוק יותר</small></div>
    <div class="seg" id="moveForm">${MOVES.map(([v, l, i]) => `<button type="button" data-v="${v}" aria-pressed="${(f.move || "walk") === v}">${ic(i)}${l}</button>`).join("")}</div>
    <div class="section-label">נגישות <small class="muted">נעדיף מקומות נגישים, פחות הליכה והצעות למונית</small></div>
    <div class="seg wrap" id="mobility">${MOBILITY.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${(f.mobility || "") === v}">${l}</button>`).join("")}</div>
    <div class="section-label">קצב</div>
    <div class="seg" id="pace">${["רגוע", "מאוזן", "אינטנסיבי"].map(v => `<button type="button" aria-pressed="${f.pace === v}">${v}</button>`).join("")}</div>
    <label class="section-label" for="notes">עוד משהו שחשוב לדעת?</label>
    <textarea id="notes" placeholder="למשל: מגיעים עם ילדים, לא אוכלים בשר, רוצים שקיעה יפה">${esc(f.notes)}</textarea>
    ${ai.enabled() ? "" : `<div class="disclaim">${ic("info")}<span>ההערות האלה נלקחות בחשבון רק כשהמדריך החכם מופעל (בהגדרות). בלי זה המסלול נבנה לפי תחומי העניין והקצב.</span></div>`}
    <button class="btn coral block" id="buildBtn" type="button">${ic("sparkle")} בנו לי טיול</button>
    <div class="status" id="buildStatus"></div>
  </div>`;
  },
  bind() {
    const f = S.form;
    $("backHome").onclick = () => go("home");
    const setD = v => { f.days = Math.min(5, Math.max(1, v)); $("dval").textContent = f.days === 1 ? "יום אחד" : f.days + " ימים"; };
    $("dminus").onclick = () => setD(f.days - 1);
    $("dplus").onclick = () => setD(f.days + 1);
    document.querySelectorAll(".tile").forEach(t => t.onclick = () => { const k = t.dataset.k, on = f.interests.includes(k); f.interests = on ? f.interests.filter(x => x !== k) : [...f.interests, k]; t.setAttribute("aria-pressed", !on); });
    ["budget", "pace", "diet"].forEach(id => $(id).querySelectorAll("button").forEach(b => b.onclick = () => { f[id] = b.textContent; $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
    $("moveForm").querySelectorAll("button").forEach(b => b.onclick = () => { f.move = b.dataset.v; $("moveForm").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $("mobility").querySelectorAll("button").forEach(b => b.onclick = () => { f.mobility = b.dataset.v; $("mobility").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $("notes").oninput = e => f.notes = e.target.value;
    $("startDate").onchange = e => { f.start = e.target.value; };
    const setP = v => { f.people = Math.min(8, Math.max(1, v)); $("pval").textContent = f.people; };
    $("pminus").onclick = () => setP(f.people - 1);
    $("pplus").onclick = () => setP(f.people + 1);
    $("buildBtn").onclick = build;
  }
};

const MOBILITY = [["", "בלי מגבלה"], ["wheelchair", "כיסא גלגלים"], ["stroller", "עגלת תינוק"], ["walking", "קושי בהליכה"]];
const LSTEPS = ["מאתרים את היעד", "אוספים מסעדות, קניונים ואטרקציות", "בונים מסלול לפי מה שבחרתם"];
let buildCtl = null;
SCREENS.loading = {
  view() {
    return `<div class="screen loading"><div class="globe"><span>${ic("pin")}</span></div>
    <div><h1 style="font-size:1.4rem">טסים ל${esc(S.dest?.he || "")}</h1><p class="lead" style="margin-top:6px">בונים את המסלול. הסיפורים והתמונות ימשיכו להיטען כשהמסלול כבר יוצג.</p></div>
    <div class="lsteps" id="lsteps">${LSTEPS.map((t, i) => `<div class="${i === 0 ? "now" : ""}"><i>${ic("check", 3)}</i>${t}</div>`).join("")}</div>
    <button type="button" class="btn soft" id="cancelBuild">ביטול</button></div>`;
  },
  bind() { $("cancelBuild").onclick = () => buildCtl?.abort(); }
};
const buildErr = code => ({
  not_found: "לא מצאנו את היעד. נסו לכתוב עיר ומדינה, למשל 'פורטו, פורטוגל'.",
  too_few: "מצאנו מעט מדי מקומות ביעד הזה. נסו עיר גדולה יותר, פחות ימים או תחומי עניין אחרים.",
  network: "השרתים של OpenStreetMap ושל ויקיפדיה לא ענו. בדקו את החיבור לאינטרנט ולחצו שוב על 'בנו לי טיול'."
})[code] || "משהו השתבש בבניית הטיול. בדקו את החיבור לאינטרנט ונסו שוב.";
async function build() {
  go("loading");
  buildCtl = new AbortController();
  const step = i => document.querySelectorAll("#lsteps div").forEach((d, k) => d.className = k < i ? "on" : k === i ? "now" : "");
  const onGeo = g => { S.dest.lat = g.lat; S.dest.lng = g.lng; flyCenter(g, 12.3, reduced ? 0 : 5200); };
  try {
    const trip = await planner.build({ query: S.dest.q, ...S.form, ...memoryOpts(), onGeo }, step, buildCtl.signal);
    rememberForm(S.form);
    saveTrip(trip);
    openTrip(trip);
    toast(`המסלול ב${trip.city} מוכן`);
  } catch (e) {
    if (e?.code !== "cancelled") console.error("[masa] build failed", e?.code || "", e?.stack || e);
    go("goals");
    if (e?.code !== "cancelled") $("buildStatus").textContent = buildErr(e?.code);
  }
}

/* ---------- plan ---------- */
function peakWord(s) { if (!s.busy) return ""; const open = s.busy.filter(v => v > 0); const avg = open.length ? open.reduce((a, b) => a + b, 0) / open.length : 0; return avg > 75 ? "עמוס מאוד" : avg > 55 ? "עמוס בצהריים" : "בדרך כלל רגוע"; }
const MOVES = [["walk", "ברגל", "nav"], ["transit", "תחבורה ציבורית", "bus"], ["car", "רכב", "car"]];
function legInfo(d, i) {
  const a = d.stops[i - 1], b = d.stops[i];
  const leg = d.legs?.[i - 1];
  const kmv = leg ? leg.m / 1000 : km(a, b) * (d.move === "car" ? 1.35 : 1.25);
  const min = Math.max(1, Math.round(planner.legMinutes(d, i - 1)));
  const mode = d.move === "car" && km(a, b) >= 0.6 ? "car" : d.move === "transit" && km(a, b) > 1.2 ? "transit" : "walk";
  return { kmv, min, mode, transit: mode === "walk" && min > 35 };
}
function totalWalk(t) { let w = 0; t.days.forEach(d => d.stops.forEach((s, i) => { if (i) { const L = legInfo(d, i); if (L.mode === "walk") w += L.kmv; } })); return w; }
function totalDrive(t) { let w = 0; t.days.forEach(d => d.stops.forEach((s, i) => { if (i) { const L = legInfo(d, i); if (L.mode !== "walk") w += L.kmv; } })); return w; }
SCREENS.plan = {
  view() {
    const t = S.trip, all = t.days.flatMap(d => d.stops);
    const d = t.days[S.day], col = cv(DAYC[S.day % 5]);
    const ideas = d.stops.flatMap(s => (s.nearby || []).map(n => ({ ...n, _near: s.name }))).filter(n => !d.stops.some(s => s.name === n.name)).slice(0, 3);
    const tag = t.source === "sample" ? "טיול לדוגמה" : t.ai ? "נבנה ממידע פתוח + מדריך חכם" : "נבנה ממידע פתוח";
    return `<div class="screen">
    <div class="triphero"><div class="eyebrow" style="color:#fff;opacity:.9">${tag} · ${esc(t.country || "")}</div>
      <h1>${esc(t.city)} · ${t.days.length} ${t.days.length === 1 ? "יום" : "ימים"}</h1><p>${esc(t.summary || "")}</p>${t.pending ? `<div class="pending"><i></i>מוסיפים סיפורים, תמונות ומסלולי הליכה…</div>` : ""}
      <div class="stats"><div><b>${all.length}</b><small>תחנות</small></div><div><b>${all.filter(s => s.booking?.needed).length}</b><small>דורשות הזמנה</small></div><div><b>${totalWalk(t).toFixed(1)}</b><small>ק״מ הליכה</small></div>${(t.opts?.move || "walk") !== "walk" ? `<div><b>${totalDrive(t).toFixed(0)}</b><small>${t.opts.move === "car" ? "ק״מ נסיעה" : "ק״מ בתחבורה"}</small></div>` : ""}${t.cc || t.slug ? `<button type="button" id="costStat"><b>${money(COST.ils(COST.trip(t).total))}</b><small>עלות משוערת</small></button>` : ""}</div></div>
    ${t.source === "sample" ? "" : `<div class="movebar"><span>איך מתניידים?</span><div class="seg" id="moveSeg">${MOVES.map(([v, l, i]) => `<button type="button" data-move="${v}" aria-pressed="${(t.opts?.move || "walk") === v}">${ic(i)}${l}</button>`).join("")}</div></div>`}
    <div class="duo">
      ${t.source === "sample" ? "" : t.hotel ? `<button type="button" class="duocard" id="hotelCard"><span class="ic" style="background:var(--primary)">${ic("bed")}</span><span><small>המלון שלכם</small><b>${esc(t.hotel.name)}</b></span></button>`
        : `<button type="button" class="duocard" id="hotelCard"><span class="ic" style="background:var(--primary)">${ic("bed")}</span><span><small>איפה לישון?</small><b>המלון שלכם, או מלונות שמתאימים למסלול</b></span></button>`}
      <button type="button" class="duocard" id="infoCard"><span class="ic" style="background:var(--teal)">${ic("info")}</span><span><small>לפני שטסים</small><b>מזג אוויר, כסף, eSIM</b></span></button>
      <button type="button" class="duocard" id="moveCard"><span class="ic" style="background:var(--violet)">${ic("bus")}</span><span><small>תחבורה</small><b>מהשדה לעיר ובתוך העיר</b></span></button>
    </div>
    <div class="daytabs" role="tablist">${t.days.map((x, i) => `<button type="button" role="tab" class="daytab" data-i="${i}" aria-selected="${i === S.day}" style="${i === S.day ? `background:${cv(DAYC[i % 5])}` : ""}"><span class="dot" style="background:${i === S.day ? "#fff" : cv(DAYC[i % 5])}"></span>${esc(x.label)}</button>`).join("")}</div>
    ${d.theme ? `<div class="daytheme">${esc(d.theme)}</div>` : ""}
    <div class="timeline">${d.stops.map((s, i) => {
      let leg = "";
      if (i) { const L2 = legInfo(d, i), p = d.stops[i - 1];
        leg = legRow(t, p, s, L2); }
      return leg + `<button type="button" class="stop" data-i="${i}">${s.image ? `<span class="thumb" style="background-image:url('${esc(s.image)}')"><span class="n" style="color:${col}">${i + 1}</span></span>` : `<span class="ic" style="background:${cv(CATS[catOf(s)].c)}">${ic(catOf(s))}<span class="n" style="color:${col}">${i + 1}</span></span>`}
        <span style="min-width:0">${s.mealHe ? `<span class="mealtag">${esc(s.mealHe)}</span>` : s.must ? `<span class="mealtag must">חובה לראות</span>` : ""}<span class="t">${esc(s.name)}</span>${placeLine(s) ? `<span class="pline">${placeLine(s)}</span>` : ""}<span class="meta">${s.time ? `<span>${ic("clock")}${esc(s.time)}</span>` : ""}${s.duration ? `<span>${ic("hourglass")}${esc(s.duration)}</span>` : ""}${s.busy ? `<span>${ic("users")}${peakWord(s)}</span>` : ""}</span></span>
        <span class="tag ${s._added ? "new" : s.booking?.needed ? "book" : "free"}">${s._added ? "הוספתם" : s.booking?.needed ? "דורש הזמנה" : "בלי הזמנה"}</span></button>`;
    }).join("")}</div>
    ${ideas.length ? `<div class="ideas"><h2>${ic("sparkle")} נשאר לכם זמן היום? רעיונות בדרך</h2>
      ${ideas.map(n => `<div class="idea"><span class="ic" style="background:${cv(CATS[catOf(n)].c)}">${ic(catOf(n))}</span><span><b>${esc(n.name)}</b><small>ליד ${esc(n._near)} · ${esc(n.why)}</small></span><button type="button" class="btn small soft" data-add="${esc(n.name)}">${ic("plus")}הוספה</button></div>`).join("")}</div>` : ""}
    ${t.cc || t.slug ? costCard(t) : ""}
    ${t.source === "sample" ? "" : familyCard(t)}
    <button type="button" class="btn soft block" id="toDiscover">${ic("compass")} עוד דברים מיוחדים לעשות ב${esc(t.city)}</button>
    <div class="disclaim">${ic("info")}<span>שעות, מחירים ועומסים הם הערכה. לפני שמזמינים, בדקו באתר הרשמי של המקום.</span></div>
  </div>`;
  },
  bind() {
    document.querySelectorAll(".daytab").forEach(b => b.onclick = () => { S.day = +b.dataset.i; S.stop = 0; go("plan"); });
    document.querySelectorAll(".stop").forEach(b => b.onclick = () => { S.stop = +b.dataset.i; go("place"); });
    document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
      const d = S.trip.days[S.day];
      const n = d.stops.flatMap(s => s.nearby || []).find(x => x.name === b.dataset.add);
      if (n) { addToDay(n); rerenderKeepScroll(); }
    });
    $("toDiscover").onclick = () => go("discover");
    $("costStat") && ($("costStat").onclick = () => $("costCard")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const setPeople = v => { const t = S.trip; t.opts = t.opts || {}; t.opts.people = Math.min(12, Math.max(1, v)); saveTrip(t); rerenderKeepScroll(); };
    $("cpMinus") && ($("cpMinus").onclick = () => setPeople((S.trip.opts?.people || 2) - 1));
    $("cpPlus") && ($("cpPlus").onclick = () => setPeople((S.trip.opts?.people || 2) + 1));
    $("infoCard").onclick = () => go("info");
    $("moveCard").onclick = () => go("move");
    document.querySelectorAll("[data-move]").forEach(b => b.onclick = () => { if ((S.trip.opts?.move || "walk") !== b.dataset.move) rebuildWith({ move: b.dataset.move }, { walk: "המסלול עכשיו ברגל: כל יום באזור אחד", transit: "המסלול עכשיו עם תחבורה ציבורית", car: "המסלול עכשיו ברכב: אפשר להגיע רחוק יותר" }[b.dataset.move]); });
    bindFamily();
    $("hotelCard") && ($("hotelCard").onclick = () => { if (S.trip.hotel) { S.poi = { ...S.trip.hotel }; S.list = { chip: "hotel", sort: "fit", page: 1 }; go("poi"); } else openList("hotel"); });
  }
};
function addToDay(item, dayIdx = S.day, after = null) {
  const d = S.trip.days[dayIdx];
  if (d.stops.some(s => s.name === item.name)) { toast("המקום כבר במסלול"); return; }
  if (!hasXY(item)) { toast("אין למקום הזה מיקום על המפה"); return; }
  const stop = {
    name: item.name, local: item.local || item.name, cat: item.cat || "view", lat: +item.lat, lng: +item.lng, time: "", duration: "", _min: 45, cost: "",
    why: item.why || "", history: "", histLang: "he", fact: "", busy: null, best: "", tip: "", nearby: [], website: item.website || null, wikidata: item.wikidata || null,
    booking: { needed: false, steps: ["בדקו בגוגל מפות את שעות הפתיחה לפני שמגיעים."], query: item.local || item.name }, _added: true
  };
  let idx = d.stops.length;
  if (after != null) idx = after + 1;
  else { let best = Infinity; d.stops.forEach((s, i) => { const dd = km(s, stop); if (dd < best) { best = dd; idx = i + 1; } }); }
  d.stops.splice(idx, 0, stop);
  d.route = null; d.legs = null;
  planner.assignTimes(d);
  toast(`${item.name} נוסף ל${d.label}`);
  renderMap();
  planner.computeRoute(d).then(() => { if (S.trip?.days.includes(d)) { renderMap(); if (S.screen === "plan") rerenderKeepScroll(); } });
  if (S.trip.source !== "sample") saveTrip(S.trip);
}

/* ---------- place ---------- */
function busyChart(s) {
  if (!s.busy) return "";
  const mx = Math.max(...s.busy, 1), peakIdx = s.busy.indexOf(mx);
  const open = s.busy.map((v, i) => ({ v, i })).filter(x => x.v > 0);
  const low = open.length ? open.reduce((a, b) => b.v < a.v ? b : a) : null;
  const color = v => v >= 80 ? cv("--coral") : v >= 55 ? cv("--sun") : cv("--teal");
  const src = s.busySrc === "ai" ? "הערכה של המדריך החכם" : "הערכה לפי סוג המקום ושעות הפתיחה";
  return `<div class="card busycard"><h2>${ic("users")} מתי עמוס כאן</h2>
    <div class="busy" role="img" aria-label="עומס משוער לפי שעה. השעה העמוסה ${HOURS[peakIdx]}:00${low ? `, השקטה ${HOURS[low.i]}:00` : ""}">${s.busy.map((v, i) => `<div><i style="height:${v ? Math.max(6, v / 100 * 72) : 3}px;background:${v ? color(v) : "var(--line)"}"></i><small>${i % 3 === 0 ? String(HOURS[i]).padStart(2, "0") : ""}</small></div>`).join("")}</div>
    <div class="busylegend"><span><i style="background:var(--teal)"></i>שקט</span><span><i style="background:var(--sun)"></i>בינוני</span><span><i style="background:var(--coral)"></i>עמוס</span><span><i style="background:var(--line)"></i>סגור</span></div>
    ${s.best ? `<div class="besttime">${ic("clock")}<span>הזמן הכי טוב להגיע: ${esc(s.best)}</span></div>` : ""}
    ${s.hours ? `<div class="hoursrow">${ic("info")}<span>שעות פתיחה לפי OpenStreetMap: <bdi dir="ltr" class="nowrap">${esc(s.hours)}</bdi></span></div>` : ""}
    <div class="disclaim">${ic("info")}<span>${src}, לא נתון חי. בסופי שבוע ובעונה עמוס יותר.</span></div></div>`;
}
SCREENS.place = {
  view() {
    const d = S.trip.days[S.day], s = d.stops[S.stop], next = d.stops[S.stop + 1], c = CATS[catOf(s)], b = s.booking || { steps: [] };
    const done = (b.steps || []).filter((_, i) => checks[ckey(s, i)]).length;
    const playing = speaking === "hist";
    const official = s.website || b.url;
    const heroStyle = s.image ? `background-image:linear-gradient(180deg,rgba(0,0,0,.05) 35%,rgba(0,0,0,.7)),url('${esc(s.image)}')` : `background:linear-gradient(140deg,${cv(c.c)},${cv(DAYC[S.day % 5])})`;
    const histSrc = s.histAI ? "נכתב על ידי המדריך החכם" : s.wikiUrl && s.history ? `מתוך <a href="${esc(s.wikiUrl)}" target="_blank" rel="noopener">ויקיפדיה${s.histLang === "en" ? " באנגלית" : ""}</a>, ברישיון CC BY-SA` : "";
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backPlan" aria-label="חזרה למסלול">${ic("back")}</button>
      <span class="eyebrow">${esc(d.label)} · תחנה ${S.stop + 1} מתוך ${d.stops.length}</span>
      <span style="display:flex;gap:6px"><button class="iconbtn" id="prevStop" aria-label="תחנה קודמת" ${S.stop === 0 ? "disabled" : ""}>${ic("back")}</button><button class="iconbtn" id="nextStop" aria-label="תחנה הבאה" ${!next ? "disabled" : ""}>${ic("fwd")}</button></span></div>
    <div class="placehero${s.image ? " photo" : ""}" style="${heroStyle}">${s.image ? "" : `<span class="bigic">${ic(catOf(s), 1.8)}</span>`}
      <span class="tag" style="background:rgba(255,255,255,.22);color:#fff;align-self:flex-start">${c.he}</span>
      <h1>${esc(s.name)}</h1>${s.local && s.local !== s.name ? `<div class="local">${esc(s.local)}</div>` : ""}
      ${s.image && s.wikiUrl ? `<a class="credit" href="${esc(s.wikiUrl)}" target="_blank" rel="noopener">תמונה: ויקיפדיה</a>` : ""}</div>
    ${(s.time || s.duration || s.cost) ? `<div class="facts"><div><small>${ic("clock")}שעה</small><b>${esc(s.time || "—")}</b></div><div><small>${ic("hourglass")}משך</small><b>${esc(s.duration || "—")}</b></div><div><small>${ic("coin")}עלות</small><b>${money(esc(stopCost(s) || "—"))}</b></div></div>` : ""}
    ${placeLine(s) ? `<div class="pline big">${placeLine(s)}</div>` : ""}
    ${s.isHotel ? "" : visitedRow(s)}
    ${s.meal && s.meal !== "hotel" ? `<button type="button" class="btn small soft" id="swapMeal">${ic("search")}להחליף ב${s.kind === "bar" || s.kind === "club" ? "מקום" : "מסעדה"} אחר${s.kind === "bar" || s.kind === "club" ? "" : "ת"}, או לחפש לפי שם</button>` : ""}
    ${(s.signals || []).length ? `<div class="sigs">${s.signals.map(x => `<span>${ic("check", 2.6)}${esc(x)}</span>`).join("")}</div>` : ""}
    ${s.whyLang === "en" ? `<div class="vquote"><p dir="ltr" lang="en">${esc(s.why)}</p><div class="source">המלצה מתוך <a href="https://en.wikivoyage.org/wiki/${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}" target="_blank" rel="noopener">Wikivoyage</a>, ברישיון CC BY-SA</div></div>` : `<p>${esc(s.why)}</p>`}
    ${contactRow(s)}
    ${brokerRow(s)}
    <div class="card storycard"><h2>${ic("book")} הסיפור של המקום</h2>
      ${s.history ? `<p class="story" ${s.histLang === "en" ? 'dir="ltr" lang="en" style="text-align:left"' : ""}>${esc(s.history)}</p>` : `<p class="lead">${S.trip.pending ? "טוענים את הסיפור…" : ai.enabled() ? "עוד אין כאן סיפור. המדריך החכם יכול לספר אותו." : "לא מצאנו ערך בוויקיפדיה על המקום הזה."}</p>`}
      ${s.fact ? `<div class="didyou"><b>הידעתם? </b>${esc(s.fact)}</div>` : ""}
      <div class="listen">
        ${s.history && canSpeak ? `<button type="button" class="btn small ${playing ? "coral playing" : ""}" id="listenBtn">${playing ? ic("stop") : ic("sound")}${playing ? "עצירה" : "האזינו לסיפור"}<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>` : ""}
        ${ai.enabled() ? `<button type="button" class="btn small ${s.history && s.histLang === "he" ? "soft" : ""}" id="genHist">${ic("sparkle")}${s.history && s.histLang === "he" ? "עוד מהמדריך" : "ספרו לי בעברית"}</button>`
          : `<a class="btn small soft" href="${s.wikiUrl ? esc(s.wikiUrl) : gSearch(`${s.local} ${cityQ()} history`)}" target="_blank" rel="noopener" style="text-decoration:none">${ic(s.wikiUrl ? "wiki" : "search")}${s.wikiUrl ? "לערך המלא" : "חיפוש היסטוריה"}</a>`}
      </div>
      ${histSrc ? `<div class="source">${histSrc}</div>` : ""}
      <div class="status" id="histStatus"></div></div>
    ${S.trip.source === "sample" ? "" : notesCard(s)}
    ${busyChart(s)}
    ${s.tip ? `<div class="tipbox">${ic("bulb")}<span><b>טיפ מהמדריך: </b>${esc(s.tip)}</span></div>` : ""}
    ${(s.nearby || []).length ? `<div class="ideas"><h2>${ic("gem")} גם בסביבה, ופחות מוכר</h2>
      ${s.nearby.map(n => { const k = hasXY(n) ? km(s, n) : null; const inTrip = d.stops.some(x => x.name === n.name);
        return `<div class="idea"><span class="ic" style="background:${cv(CATS[catOf(n)].c)}">${ic(catOf(n))}</span><span><b>${esc(n.name)}</b><small>${k != null ? `${Math.max(1, Math.round(k * 1.25 / 4.6 * 60))} דק׳ הליכה · ` : ""}${esc(n.why)}</small></span>${inTrip ? `<span class="tag new">במסלול</span>` : `<button type="button" class="btn small soft" data-near="${esc(n.name)}">${ic("plus")}הוספה</button>`}</div>`; }).join("")}</div>` : ""}
    <div class="bookcard"><div class="bookhead" style="cursor:default"><span class="ic" style="background:${b.needed ? cv("--coral") : cv("--teal")}">${ic(b.needed ? "ticket" : "pin")}</span>
      <span class="grow"><h3>${b.needed ? "כדאי להזמין מראש" : "אין צורך בהזמנה"}</h3><span class="meta">${b.needed ? `${done} מתוך ${b.steps.length} שלבים הושלמו` : "איך מגיעים ונכנסים"}</span></span></div>
      <ul class="checks">${(b.steps || []).slice(0, b.needed ? 2 : 9).map((x, i) => `<li><label class="${checks[ckey(s, i)] ? "done" : ""}"><input type="checkbox" data-i="${i}" ${checks[ckey(s, i)] ? "checked" : ""}><span><span class="stepn">שלב ${i + 1}</span>${esc(x)}</span></label></li>`).join("")}</ul>
      ${b.needed ? `<div style="padding:0 12px 12px"><button type="button" class="btn block" id="toBook">${ic("ticket")} לכל שלבי ההזמנה</button></div>` : ""}</div>
    <div class="linkrow">
      ${official ? `<a class="lnk primary" href="${esc(official)}" target="_blank" rel="noopener">${ic("shield")}אתר רשמי</a><a class="lnk" href="${gmPlace(s)}" target="_blank" rel="noopener">${ic("pin")}גוגל מפות</a>`
        : `<a class="lnk primary" href="${gmPlace(s)}" target="_blank" rel="noopener">${ic("pin")}גוגל מפות</a><a class="lnk" href="${gSearch(b.query || `${s.local} ${cityQ()}`)}" target="_blank" rel="noopener">${ic("search")}${b.needed ? "חיפוש אתר רשמי" : "עוד מידע"}</a>`}
      ${next ? `<a class="lnk wide" href="${gmDir(s, next)}" target="_blank" rel="noopener">${ic("nav")}ניווט לתחנה הבאה: ${esc(next.name)}</a>` : ""}
    </div>
  </div>`;
  },
  bind() {
    const s = S.trip.days[S.day].stops[S.stop];
    $("backPlan").onclick = () => go("plan");
    $("prevStop").onclick = () => { if (S.stop > 0) { S.stop--; go("place"); } };
    $("nextStop").onclick = () => { if (S.stop < S.trip.days[S.day].stops.length - 1) { S.stop++; go("place"); } };
    $("toBook") && ($("toBook").onclick = () => { S.openBook = s.name; go("book"); });
    bindVisited(s); bindNotes(s);
    $("swapMeal") && ($("swapMeal").onclick = () => {
      const chip = s.kind === "cafe" || s.kind === "bakery" ? "cafe" : s.kind === "dessert" ? "dessert" : s.kind === "bar" || s.kind === "club" ? "bar" : s.kind === "market" || s.kind === "deli" ? "market" : "food";
      S.replace = { day: S.day, stop: S.stop, name: s.name, mealHe: s.mealHe };
      openList(chip); S.list.sort = "near"; rerenderKeepScroll();
    });
    $("genHist") && ($("genHist").onclick = () => s.history && s.histLang === "he"
      ? (go("guide"), ask(`ספר לי עוד על ${s.name}, כאילו אתה מדריך שעומד איתי שם. מה לחפש בעיניים כשאני מגיע?`))
      : genHistory(s));
    $("listenBtn") && ($("listenBtn").onclick = () => {
      if (speaking === "hist") { stopSpeak(); rerenderKeepScroll(); return; }
      const lang = s.histLang === "en" ? "en-US" : "he-IL";
      const ok = speak(`${s.name}. ${s.history} ${s.fact ? "הידעתם? " + s.fact : ""}`, lang, "hist", () => { if (S.screen === "place") rerenderKeepScroll(); });
      if (!ok) { $("histStatus").textContent = "הדפדפן הזה לא תומך בהקראה."; return; }
      rerenderKeepScroll();
      if (!voiceFor(lang)) $("histStatus").textContent = "לא נמצא בדפדפן קול בשפה הזו, אז ההקראה עשויה להישמע לא טבעית.";
    });
    document.querySelectorAll("[data-near]").forEach(b => b.onclick = () => { const n = s.nearby.find(x => x.name === b.dataset.near); if (n) { addToDay(n, S.day, S.stop); rerenderKeepScroll(); } });
    bindChecks(() => s);
  }
};
function bindChecks(getStop) {
  document.querySelectorAll(".checks input").forEach(inp => inp.onchange = () => {
    const s = getStop(inp);
    checks[ckey(s, +inp.dataset.i)] = inp.checked;
    store.set("masa-checks", checks);
    rerenderKeepScroll();
  });
}
async function genHistory(s) {
  const st = $("histStatus"), btn = $("genHist");
  if (btn) { btn.disabled = true; btn.innerHTML = `${ic("sparkle")}כותב…`; }
  try {
    const r = await ai.json(`You are a tour guide and historian. For the real place "${s.local}" in ${cityQ()}, ${S.trip.country}${s.history ? `. Wikipedia says: ${s.history.slice(0, 600)}` : ""}. Reply with only JSON in Hebrew: {"history":"2-4 sentences telling its real story like a guide on site (dates, people, what to look for). Do not invent facts you are unsure of","fact":"one surprising true sentence","best":"short best time to visit","busy":[16 integers 0-100, typical crowd per hour 07:00..22:00, 0=closed]}`);
    if (r.history) { s.history = r.history; s.histLang = "he"; s.histAI = true; }
    if (r.fact) s.fact = r.fact;
    if (r.best) s.best = r.best;
    if (Array.isArray(r.busy) && r.busy.length >= 12) { s.busy = Array.from({ length: 16 }, (_, k) => Math.max(0, Math.min(100, Math.round(+r.busy[k] || 0)))); s.busySrc = "ai"; }
    if (S.trip.source !== "sample") saveTrip(S.trip);
    rerenderKeepScroll();
  } catch (e) {
    if (st) st.textContent = ai.errText(e.code);
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic("sparkle")}ספרו לי בעברית`; }
  }
}

/* ---------- discover ---------- */
const DSECS = [["gems", "gem", "אוצרות נסתרים", "--violet"], ["experiences", "sparkle", "חוויות מיוחדות", "--coral"], ["free", "heart", "בחינם", "--teal"], ["daytrips", "train", "טיולי יום", "--sky"]];
const discItems = () => { const D = S.trip?.discover || {}; return DSECS.flatMap(([k]) => D[k] || []); };
SCREENS.discover = {
  view() {
    const t = S.trip, D = t.discover || {};
    const dayOpts = t.days.map((d, i) => `<option value="${i}" ${i === S.day ? "selected" : ""}>${esc(d.label)}</option>`).join("");
    const phrases = D.phrases || PHRASES.en;
    const etiq = D.etiquette?.length ? D.etiquette : ETIQUETTE_GENERIC;
    return `<div class="screen">
    <div><div class="eyebrow">גלו עוד ב${esc(t.city)}</div><h1 style="margin-top:4px">מה עוד אפשר לעשות?</h1><p class="lead" style="margin-top:6px">רעיונות מעבר למסלול. רעיון עם מיקום אפשר להוסיף ליום שתבחרו, והוא מסומן גם על המפה.</p></div>
    ${socialCityCard(t)}
    <div class="catgrid">${CHIPS.filter(([k, , kinds]) => (t.places || []).some(p => kinds.includes(p.kind))).map(([k, label, kinds, icon]) => `<button type="button" data-chip="${k}"><span class="ic" style="background:${cv(CATS[catOf({ cat: planner.KIND[kinds[0]]?.cat })].c)}">${ic(icon)}</span>${label}<small>${(t.places || []).filter(p => kinds.includes(p.kind)).length}</small></button>`).join("")}</div>
    <label class="section-label" for="addDay">להוסיף רעיונות אל</label>
    <select id="addDay" class="select">${dayOpts}</select>
    ${DSECS.map(([k, i, title, col]) => (D[k] || []).length ? `<section class="dsec"><h2><span class="chipic" style="background:${cv(col)}">${ic(i)}</span>${title}</h2>
      ${D[k].map(it => { const inTrip = t.days.some(d => d.stops.some(s => s.name === it.name));
        return `<div class="ditem" data-did="${esc(it.name)}"><span style="min-width:0"><b>${esc(it.name)}</b>${it.local && it.local !== it.name ? `<span class="sub">${esc(it.local)}</span>` : ""}<p>${esc(it.why)}</p></span>
        ${inTrip ? `<span class="tag new">במסלול</span>` : hasXY(it) ? `<button type="button" class="btn small soft" data-dadd="${esc(it.name)}">${ic("plus")}הוספה</button>` : `<a class="btn small soft" href="${gSearch(`${it.local || it.name} ${cityQ()}`)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("search")}חיפוש</a>`}</div>`; }).join("")}</section>` : "").join("")}
    ${(D.dishes || []).length ? `<section class="dsec"><h2><span class="chipic" style="background:var(--sun)">${ic("food")}</span>מה חייבים לטעום</h2>
      <div class="dishes">${D.dishes.map((x, i) => `<div class="dish" style="background:linear-gradient(145deg,${cv(["--sun", "--coral", "--rose", "--violet", "--teal", "--sky"][i % 6])},${cv(["--coral", "--rose", "--violet", "--primary", "--sky", "--teal"][i % 6])})"><b>${esc(x.name)}</b><small>${esc(x.local || "")}</small><p>${esc(x.why)}</p></div>`).join("")}</div></section>`
      : ai.enabled() ? "" : `<div class="upsell">${ic("sparkle")}<span>רוצים גם מנות מקומיות, חוויות וטיולי יום? הפעילו את המדריך החכם בחינם.</span><button type="button" class="btn small" data-settings>להפעלה</button></div>`}
    <section class="dsec"><h2><span class="chipic" style="background:var(--primary)">${ic("speech")}</span>משפטים שימושיים</h2>
      ${phrases.items.map((x, i) => `<div class="phrase"><span><b>${esc(x.local)}</b><small>${esc(x.he)} · ${esc(x.say || "")}</small></span>${canSpeak ? `<button type="button" data-say="${i}" aria-label="השמעה">${ic("sound")}</button>` : ""}</div>`).join("")}</section>
    <section class="dsec"><h2><span class="chipic" style="background:var(--teal)">${ic("info")}</span>כדאי לדעת</h2><ul class="etiq">${etiq.map(x => `<li>${ic("check")}<span>${esc(x)}</span></li>`).join("")}</ul></section>
    <div class="disclaim">${ic("info")}<span>בדקו שעות פתיחה ומחירים לפני שיוצאים.</span></div>
  </div>`;
  },
  bind() {
    const D = S.trip.discover || {};
    document.querySelectorAll(".catgrid [data-chip]").forEach(b => b.onclick = () => openList(b.dataset.chip));
    $("addDay").onchange = e => { S.day = +e.target.value; renderMap(); };
    document.querySelectorAll("[data-dadd]").forEach(b => b.onclick = () => { const it = discItems().find(x => x.name === b.dataset.dadd); if (it) { addToDay(it, +$("addDay").value); rerenderKeepScroll(); } });
    const ph = D.phrases || PHRASES.en;
    document.querySelectorAll("[data-say]").forEach(b => b.onclick = () => { const x = ph.items[+b.dataset.say]; if (!speak(x.local, ph.lang, "ph")) toast("הדפדפן הזה לא תומך בהשמעה"); else if (!voiceFor(ph.lang)) toast("לא נמצא בדפדפן קול בשפה הזו"); });
    document.querySelectorAll("[data-settings]").forEach(b => b.onclick = () => { S.prev = S.screen; go("settings"); });
  }
};

/* ---------- bookings ---------- */
const allBook = () => S.trip.days.flatMap(d => d.stops.map(s => ({ s, day: d.label }))).filter(x => x.s.booking?.needed);
function ring(p, col) { const r = 15, c = 2 * Math.PI * r; return `<svg class="ring" viewBox="0 0 38 38"><circle cx="19" cy="19" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="5"/><circle cx="19" cy="19" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 19 19)"/><text x="19" y="23" text-anchor="middle" font-size="10" font-family="IBM Plex Mono,monospace" fill="var(--ink)">${Math.round(p * 100)}%</text></svg>`; }
SCREENS.book = {
  view() {
    const list = allBook();
    if (!list.length) return `<div class="screen"><div class="eyebrow">מרכז ההזמנות</div><h1>אין הזמנות לעשות</h1><p class="lead">אף תחנה במסלול לא דורשת הזמנה מראש.</p></div>`;
    const stat = list.map(({ s }) => { const n = s.booking.steps.length, d = s.booking.steps.filter((_, i) => checks[ckey(s, i)]).length; return { n, d }; });
    const complete = stat.filter(x => x.d === x.n).length;
    return `<div class="screen">
    <div><div class="eyebrow">מרכז ההזמנות</div><h1 style="margin-top:4px">${complete} מתוך ${list.length} הזמנות הושלמו</h1></div>
    <div class="progress"><i style="width:${complete / list.length * 100}%"></i></div>
    <p class="lead">סמנו כל שלב כשסיימתם. ההתקדמות נשמרת בדפדפן הזה.</p>
    ${list.map(({ s, day }, bi) => { const st = stat[bi], open = S.openBook === s.name, c = CATS[catOf(s)], url = s.website || s.booking.url;
      return `<div class="bookcard" data-b="${bi}"><button type="button" class="bookhead" data-name="${esc(s.name)}" aria-expanded="${open}"><span class="ic" style="background:${cv(c.c)}">${ic(catOf(s))}</span>
        <span class="grow"><h3>${esc(s.name)}</h3><span class="meta"><span>${esc(day)}</span>${s.time ? `<span>${ic("clock")}${esc(s.time)}</span>` : ""}${s.cost ? `<span>${ic("coin")}${esc(s.cost)}</span>` : ""}</span></span>${ring(st.n ? st.d / st.n : 0, st.d === st.n ? cv("--teal") : cv("--coral"))}</button>
        ${open ? `<ul class="checks">${s.booking.steps.map((x, i) => `<li><label class="${checks[ckey(s, i)] ? "done" : ""}"><input type="checkbox" data-i="${i}" ${checks[ckey(s, i)] ? "checked" : ""}><span><span class="stepn">שלב ${i + 1}</span>${esc(x)}</span></label></li>`).join("")}</ul>
        ${s.best ? `<div class="besttime" style="margin:0 12px 10px">${ic("clock")}<span>שעה מומלצת לביקור: ${esc(s.best)}</span></div>` : ""}
        <div class="linkrow" style="padding:0 12px 12px">${url ? `<a class="lnk primary wide" href="${esc(url)}" target="_blank" rel="noopener">${ic("shield")}לאתר הרשמי ${ic("ext")}</a>` : `<a class="lnk primary wide" href="${gSearch(s.booking.query || s.local)}" target="_blank" rel="noopener">${ic("search")}למציאת האתר הרשמי ${ic("ext")}</a>`}</div>` : ""}</div>`; }).join("")}
    <div class="disclaim">${ic("shield")}<span>מסע לא גובה תשלום ולא שומר פרטי אשראי. ההזמנה עצמה נעשית תמיד באתר של המקום.</span></div>
  </div>`;
  },
  bind() {
    document.querySelectorAll(".bookhead[data-name]").forEach(b => b.onclick = () => {
      S.openBook = S.openBook === b.dataset.name ? null : b.dataset.name;
      rerenderKeepScroll();
      const x = allBook().find(x => x.s.name === S.openBook);
      if (x) flyCenter(x.s, 16);
    });
    bindChecks(inp => allBook()[+inp.closest("[data-b]").dataset.b].s);
  }
};

/* ---------- guide ---------- */
SCREENS.guide = {
  view() {
    const cur = S.trip.days[S.day].stops[S.stop];
    const head = `<div class="guidehead"><span class="av">${ic("guide")}</span><div><h2 style="color:#fff">המדריך שלכם ב${esc(S.trip.city)}</h2><p>${S.me ? "יודע איפה אתם עכשיו." : `מכיר את המסלול. כרגע אתם ליד ${esc(cur?.name || "")}.`}</p></div></div>`;
    if (!ai.enabled()) return `<div class="screen chatwrap">${head}
      <div class="card"><h2>${ic("key")} המדריך החכם עוד לא מופעל</h2>
      <p>המדריך עונה על שאלות בזמן הטיול: מה עושים כשיורד גשם, איפה לאכול ליד, וסיפורים על כל מקום. הוא עובד עם מפתח חינמי של Google Gemini, שלוקח בערך דקה להוציא.</p>
      <button type="button" class="btn block" data-settings>${ic("gear")} להפעלה בחינם</button></div>
      <div class="disclaim">${ic("info")}<span>כל השאר באתר עובד גם בלי המדריך: מפה, מסלול, היסטוריה מוויקיפדיה והזמנות.</span></div></div>`;
    return `<div class="screen chatwrap">${head}
    <div class="quick" id="quick">${["יורד גשם, מה משנים היום?", "יש לי שעתיים פנויות עכשיו", "ספר לי סיפור על המקום שאני נמצא בו", "איפה לאכול ליד התחנה הנוכחית?", "מה עושים פה בערב?"].map(q => `<button type="button">${q}</button>`).join("")}
      ${S.me ? "" : `<button type="button" id="shareLoc">${ic("locate")} לשתף מיקום</button>`}</div>
    <div class="log" id="log">${[{ r: "bot", t: `שלום! אני המדריך שלכם ב${S.trip.city}. אפשר לשאול אותי כל דבר: לשנות תוכנית, למצוא מקום לאכול, לשמוע סיפור על המקום, או מה שווה לראות בסביבה.` }, ...S.chatLog].map(m => `<div class="msg ${m.r}">${esc(m.t)}</div>`).join("")}</div>
    <div class="status" id="chatStatus"></div>
  </div>`;
  },
  bind() {
    document.querySelectorAll("[data-settings]").forEach(b => b.onclick = () => { S.prev = S.screen; go("settings"); });
    if (!ai.enabled()) return;
    $("composerSlot").innerHTML = `<form class="composer" id="askForm"><input id="askInput" type="text" placeholder="שאלו את המדריך..." aria-label="שאלה למדריך" autocomplete="off"><button class="btn" id="askBtn" type="submit" aria-label="שליחה" ${S.busy ? "disabled" : ""}>${ic("nav")}</button></form>`;
    $("askForm").onsubmit = e => { e.preventDefault(); const v = $("askInput").value.trim(); $("askInput").value = ""; ask(v); };
    document.querySelectorAll("#quick button:not(#shareLoc)").forEach(b => b.onclick = () => ask(b.textContent.trim()));
    $("shareLoc") && ($("shareLoc").onclick = locate);
    setTimeout(() => { $("scroll").scrollTop = $("scroll").scrollHeight; }, 0);
  }
};
function addMsg(r, t) { S.chatLog.push({ r, t }); const m = document.createElement("div"); m.className = "msg " + r; m.textContent = t; $("log")?.appendChild(m); $("scroll").scrollTop = $("scroll").scrollHeight; return S.chatLog[S.chatLog.length - 1]; }
async function ask(q) {
  if (!q || S.busy) return;
  if (!ai.enabled()) { S.prev = S.screen; go("settings"); return; }
  S.busy = true; $("askBtn") && ($("askBtn").disabled = true);
  addMsg("me", q);
  const entry = addMsg("bot", "חושב…");
  const bubble = () => $("log")?.lastElementChild;
  const t = S.trip, cur = t.days[S.day].stops[S.stop];
  const compact = t.days.map(d => `${d.label}: ` + d.stops.map(s => `${s.name} (${s.local}, ${(+s.lat).toFixed(4)},${(+s.lng).toFixed(4)}, ${s.time || ""})`).join(" → ")).join("\n");
  const system = `You are "מסע", a warm, practical on-the-ground tour guide and storyteller in ${t.cityLocal || t.city}, ${t.country}. Answer in Hebrew, concrete and vivid, at most about 150 words. When asked about history, tell it like a guide standing on site: dates, people, details to look for. Do not invent facts you are not sure of. Give specific nearby place names with their local names (so they can be searched on Google Maps), walking times and what to do next. Never invent booking URLs.
Traveler's plan:
${compact}
Traveler is currently viewing: ${t.days[S.day].label}, stop ${S.stop + 1}: ${cur?.name} (${cur?.local}).${S.me ? `\nTraveler's live location: ${S.me.lat.toFixed(5)},${S.me.lng.toFixed(5)}.` : ""}`;
  S.chat.push({ role: "user", content: q });
  try {
    const text = await ai.chat(system, S.chat.slice(-10));
    S.chat.push({ role: "assistant", content: text });
    entry.t = text;
  } catch (e) {
    entry.t = ai.errText(e.code);
    S.chat.pop();
  } finally {
    if (S.screen === "guide" && bubble()) bubble().textContent = entry.t;
    S.busy = false; $("askBtn") && ($("askBtn").disabled = false);
    $("scroll").scrollTop = $("scroll").scrollHeight;
  }
}

/* ---------- settings ---------- */
SCREENS.settings = {
  view() {
    const on = ai.enabled();
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backPrev" aria-label="חזרה">${ic("back")}</button><h1 style="font-size:1.5rem">הגדרות</h1><span style="width:38px"></span></div>
    <div class="card"><h2>${ic("access")} נגישות ותצוגה</h2>
      <div class="section-label">גודל טקסט</div>
      <div class="seg" id="a11ySize">${[["100", "רגיל"], ["115", "גדול"], ["130", "גדול מאוד"]].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${A11Y.size === v}">${l}</button>`).join("")}</div>
      <label class="switchrow"><input type="checkbox" id="a11yHc" ${A11Y.hc ? "checked" : ""}><span>ניגודיות גבוהה וקווים עבים יותר</span></label>
      <label class="switchrow"><input type="checkbox" id="a11yMotion" ${A11Y.still ? "checked" : ""}><span>בלי אנימציות במפה</span></label>
      <label class="switchrow"><input type="checkbox" id="a11yLinks" ${A11Y.links ? "checked" : ""}><span>קו תחתון לכל הקישורים</span></label>
    </div>
    <div class="card"><h2>${ic("sparkle")} המדריך החכם <span class="tag ${on ? "free" : "book"}">${on ? "פעיל" : "כבוי"}</span></h2>
      <p>בלי המדריך, מסע עובד עם מידע פתוח מ-OpenStreetMap ומוויקיפדיה. עם מפתח חינמי של Google Gemini מקבלים גם צ׳אט עם מדריך, סיפורים בעברית לכל מקום, טיפים אישיים ומנות מקומיות.</p>
      <ol class="howto">
        <li>נכנסים ל-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> עם חשבון גוגל.</li>
        <li>לוחצים על Create API key ומעתיקים את המפתח.</li>
        <li>מדביקים אותו כאן ולוחצים על שמירה.</li>
      </ol>
      <form id="keyForm" class="keyrow"><input id="keyInput" type="password" placeholder="${on ? "מפתח חדש" : "AIza..."}" aria-label="מפתח Gemini" autocomplete="off" dir="ltr"><button class="btn" type="submit">שמירה</button></form>
      <div class="status ok" id="keyStatus">${on && ai.model() ? `מחובר. המודל: ${esc(ai.model())}` : ""}</div>
      ${on ? `<button type="button" class="btn small soft" id="keyDel">${ic("trash")}מחיקת המפתח</button>` : ""}
      <div class="disclaim">${ic("shield")}<span>המפתח נשמר רק בדפדפן הזה ונשלח רק ל-Google. בשכבה החינמית Google עשויה להשתמש בשאלות כדי לשפר את המודלים, אז לא כותבים למדריך פרטים אישיים.</span></div>
    </div>
    <div class="card"><h2>${ic("info")} מאיפה המידע מגיע</h2>
      <ul class="etiq">
        <li>${ic("check")}<span>מפה ומקומות: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (רישיון ODbL)</span></li>
        <li>${ic("check")}<span>היסטוריה ותמונות: <a href="https://he.wikipedia.org" target="_blank" rel="noopener">ויקיפדיה</a> ו-Wikidata (רישיון CC BY-SA)</span></li>
        <li>${ic("check")}<span>מסלולי הליכה: שרת הניתוב של FOSSGIS (OSRM)</span></li>
        <li>${ic("check")}<span>עומסים: הערכה לפי סוג המקום, לא נתון חי</span></li>
      </ul></div>
    <div class="card"><h2>${ic("save")} נתונים שמורים</h2>
      <p class="lead">${savedTrips().length} טיולים שמורים בדפדפן הזה.</p>
      <button type="button" class="btn small soft" id="clearData">${ic("trash")}מחיקת הטיולים וההתקדמות</button>
      <div class="confirm" id="confirmClear" hidden><span>למחוק את כל הטיולים השמורים וסימוני ההזמנות?</span><button type="button" class="btn small coral" id="clearYes">כן, למחוק</button><button type="button" class="btn small soft" id="clearNo">ביטול</button></div>
    </div>
  </div>`;
  },
  bind() {
    $("a11ySize").querySelectorAll("button").forEach(b => b.onclick = () => { A11Y.size = b.dataset.v; applyA11y(); rerenderKeepScroll(); });
    $("a11yHc").onchange = e => { A11Y.hc = e.target.checked; applyA11y(); };
    $("a11yMotion").onchange = e => { A11Y.still = e.target.checked; applyA11y(); };
    $("a11yLinks").onchange = e => { A11Y.links = e.target.checked; applyA11y(); };
    $("backPrev").onclick = () => go(S.prev && S.prev !== "settings" && (S.trip || !TRIP_SCREENS.includes(S.prev)) ? S.prev : "home");
    $("keyForm").onsubmit = async e => {
      e.preventDefault();
      const v = $("keyInput").value.trim();
      const st = $("keyStatus");
      if (!v) { st.className = "status"; st.textContent = "הדביקו מפתח כדי לשמור."; return; }
      st.className = "status ok"; st.textContent = "בודקים את המפתח…";
      try { const m = await ai.saveKey(v); rerenderKeepScroll(); $("keyStatus").textContent = `מחובר. המודל: ${m}`; toast("המדריך החכם הופעל"); }
      catch (err) { st.className = "status"; st.textContent = ai.errText(err.code); }
    };
    $("keyDel") && ($("keyDel").onclick = async () => { await ai.saveKey(""); rerenderKeepScroll(); toast("המפתח נמחק"); });
    $("clearData").onclick = () => { $("confirmClear").hidden = false; };
    $("clearNo").onclick = () => { $("confirmClear").hidden = true; };
    $("clearYes").onclick = () => { store.set("masa-trips", []); store.set("masa-checks", {}); checks = {}; rerenderKeepScroll(); toast("הנתונים נמחקו"); };
  }
};

/* ================= explore, Google Maps style ================= */
const CUISINE_HE = { creative: "יצירתי", fusion: "פיוז׳ן", italian: "איטלקי", pizza: "פיצה", french: "צרפתי", spanish: "ספרדי", tapas: "טאפאס", japanese: "יפני", sushi: "סושי", ramen: "ראמן",
  chinese: "סיני", thai: "תאילנדי", indian: "הודי", mexican: "מקסיקני", burger: "המבורגר", steak_house: "סטייקים", seafood: "פירות ים", fish: "דגים",
  vegetarian: "צמחוני", vegan: "טבעוני", greek: "יווני", turkish: "טורקי", kebab: "קבב", czech: "צ׳כי", portuguese: "פורטוגלי", regional: "מקומי",
  mediterranean: "ים תיכוני", american: "אמריקאי", asian: "אסייתי", korean: "קוריאני", vietnamese: "וייטנאמי", lebanese: "לבנוני", israeli: "ישראלי",
  middle_eastern: "מזרח תיכוני", coffee_shop: "קפה", ice_cream: "גלידה", cake: "עוגות", breakfast: "ארוחות בוקר", german: "גרמני", austrian: "אוסטרי",
  hungarian: "הונגרי", british: "בריטי", dutch: "הולנדי", roman: "רומאי", tuscan: "טוסקני", catalan: "קטלאני", basque: "באסקי", international: "בינלאומי",
  sandwich: "כריכים", bistro: "ביסטרו", wine_bar: "בר יין", brunch: "בראנץ׳", crepe: "קרפים", noodle: "נודלס", dumpling: "כיסונים", bagel: "בייגל",
  georgian: "גאורגי", polish: "פולני", russian: "רוסי", african: "אפריקאי", ethiopian: "אתיופי", peruvian: "פרואני", argentinian: "ארגנטינאי", brazilian: "ברזילאי",
  tea: "תה", italian_pizza: "פיצה איטלקית", jewish: "יהודי", kosher: "כשר", coffee: "קפה", gelato_italian: "ג׳לטו", pasta: "פסטה", tapas_bar: "טאפאס", pastry: "מאפים", bakery: "מאפייה", gelato: "ג׳לטו", local: "מקומי", fine_dining: "פיין דיינינג" };
const cuisineList = c => String(c || "").split(/[;,]/).map(x => x.trim().toLowerCase()).filter(Boolean);
const cuisineHe = c => cuisineList(c).slice(0, 3).map(x => CUISINE_HE[x] || x.replace(/_/g, " ")).join(" · ");
const HOTEL_KINDS = ["hotel", "hostel", "guesthouse", "apartment"];
const CHIPS = [
  ["hotel", "מלונות", HOTEL_KINDS, "bed"], ["food", "מסעדות", ["restaurant"], "food"], ["cafe", "בתי קפה", ["cafe", "bakery"], "cafe"], ["dessert", "קינוחים", ["dessert"], "heart"],
  ["market", "שווקים", ["market", "deli"], "shopping"], ["street", "רחובות קניות", ["street"], "shopping"], ["mall", "קניונים וחנויות", ["mall", "store", "shop"], "shopping"], ["bar", "ברים ולילה", ["bar", "club"], "night"],
  ["sights", "אטרקציות", ["attraction", "sight", "view", "church"], "history"], ["museum", "מוזיאונים", ["museum", "gallery"], "art"], ["park", "פארקים וטבע", ["park", "beach", "zoo", "themepark"], "nature"]
];
const CHIP_ICON = { hotel: "bed", hostel: "bed", guesthouse: "bed", apartment: "bed", restaurant: "food", cafe: "cafe", bakery: "cafe", dessert: "heart", market: "shopping", deli: "shopping", mall: "shopping", street: "shopping", store: "shopping", shop: "shopping", bar: "night", club: "night", museum: "art", gallery: "art", park: "nature", beach: "nature", zoo: "family", themepark: "family", church: "religion", view: "view", sight: "history", attraction: "view" };
const PRICE = { budget: "זול", mid: "מחיר בינוני", splurge: "יוקרתי" };
/* ---------- prices: per person at restaurants, per night at hotels, the whole trip ---------- */
const COST = Masa.cost;
const FOODK = ["restaurant", "cafe", "bakery", "dessert", "market", "deli", "bar", "club"];
const tripCur = () => COUNTRY_INFO[S.trip?.cc]?.cur || "EUR";
const money = (html) => `<bdi dir="ltr">${html}</bdi>`;
function priceInfo(p) {
  const t = S.trip;
  if (!t || !p) return null;
  if (HOTEL_KINDS.includes(p.kind)) { const n = COST.night(p, t.cc, t.slug, t.opts?.budget); return { ...n, unit: n.perBed ? "למיטה ללילה" : "ללילה לחדר" }; }
  if (FOODK.includes(p.kind)) { const m = COST.perPerson(p, t.cc, t.slug, p.meal || null); return { ...m, unit: "לאדם" }; }
  return null;
}
function priceLabel(p, long = false) {
  const i = priceInfo(p);
  if (!i) return "";
  return `<b class="price">${money(COST.ilsRange(i.lo, i.hi))} ${i.unit}</b>${long ? ` <small class="pricesub">(${money(COST.localRange(i.lo, i.hi, tripCur()))}${i.src === "wv" ? ", לפי המחירים ב-Wikivoyage" : ", הערכה"})</small>` : ""}`;
}
/* entry fee for a stop, only when it is likely to cost money */
function ticketLabel(s) {
  if (!S.trip || s.meal || FOODK.includes(s.kind) || HOTEL_KINDS.includes(s.kind) || s.kind === "street") return "";
  const sure = s.fee === "yes" || ["museum", "zoo", "themepark", "gallery"].includes(s.kind) || (s.must && ["sight", "attraction"].includes(s.kind)) || s.price;
  if (!sure) return "";
  const v = COST.ticket(s, S.trip.cc, S.trip.slug);
  return v > 0 ? `כ-${COST.ils(v)} לאדם` : "";
}
function stopCost(s) {
  if (s.kind === "street") return "חינם להסתובב";
  const i = !s.isHotel && priceInfo(s);
  if (i) return `${COST.ilsRange(i.lo, i.hi)} ${i.unit}`;
  return ticketLabel(s) || s.cost || "";
}
function costCard(t) {
  const c = COST.trip(t);
  const max = Math.max(...c.rows.map(r => r.eur));
  const cur = tripCur();
  return `<div class="card costcard" id="costCard"><h2>${ic("coin")} כמה הטיול יעלה?</h2>
    <div class="costtop">
      <div class="main"><small>לכל ${c.people === 1 ? "המטייל" : `${c.people} המטיילים`}</small><b>${money(COST.ils(c.total))}</b>${cur !== "ILS" ? `<span>${money(COST.local(c.total, cur))}</span>` : ""}</div>
      <div><small>לאדם</small><b>${money(COST.ils(c.perPerson))}</b></div>
      <div><small>ליום</small><b>${money(COST.ils(c.perDay))}</b></div>
    </div>
    <div class="keyrow costpeople"><span>מטיילים</span><span class="stepper small"><button type="button" class="iconbtn" id="cpMinus" aria-label="פחות מטיילים" style="background:var(--surface)">${ic("minus", 2.4)}</button><output>${c.people}</output><button type="button" class="iconbtn" id="cpPlus" aria-label="יותר מטיילים" style="background:var(--surface)">${ic("plus", 2.4)}</button></span></div>
    <div class="costrows">${c.rows.map(r => `<div class="crow"><span class="cl"><b>${esc(r.he)}</b><small>${esc(r.note)}</small></span><b class="cv">${money(COST.ils(r.eur))}</b><span class="bar"><i style="width:${Math.max(3, Math.round(r.eur / max * 100))}%"></i></span></div>`).join("")}</div>
    <div class="disclaim">${ic("info")}<span>הערכה לפי המקומות במסלול, ${t.hotel ? "המלון שבחרתם" : "התקציב שבחרתם"} ומחירים מקובלים ב${esc(t.city)}. לא כולל טיסות וקניות.${COST.FX.live ? ` שער: €1 = ₪${COST.FX.eurILS.toFixed(2)}.` : ""}</span></div>
  </div>`;
}
/* local time in the trip's city, so "open now" is right even when planning from home */
function cityNow() {
  if (S.me && S.trip && km(S.me, S.trip) < 50) return new Date();
  const tz = S.trip?.tz;
  if (!tz) return null;
  try { return new Date(new Date().toLocaleString("en-US", { timeZone: tz })); } catch { return null; }
}
function openState(p) {
  const now = cityNow();
  if (!now || !p.hours) return null;
  return planner.isOpen(p.hours, now);
}
function placeLine(p) {
  const bits = [];
  if (p.kindHe && !p.mealHe) bits.push(p.kindHe);
  else if (!p.kindHe && planner.KIND[p.kind]) bits.push(planner.KIND[p.kind].he);
  if (p.cuisine) bits.push(cuisineHe(p.cuisine));
  const pl = !p.isHotel && priceLabel(p);
  if (pl) bits.push(pl); else if (p.priceClass) bits.push(PRICE[p.priceClass]);
  const o = openState(p);
  if (o === true) bits.push(`<b class="open">פתוח עכשיו</b>`);
  if (o === false) bits.push(`<b class="closed">סגור עכשיו</b>`);
  return bits.map(b => b.startsWith("<b") ? b : esc(b)).join(" · ");
}
const reviewsUrl = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.local || p.name} ${p.address || ""} ${cityQ()}`.trim())}`;
/* what people film and post: TikTok and Instagram searches for a place or a city (opens in the app on a phone) */
const tiktokUrl = q => `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;
const igTag = q => String(q || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const igUrl = q => igTag(q).length >= 3 ? `https://www.instagram.com/explore/tags/${igTag(q)}/` : gSearch(`site:instagram.com ${q}`);
function socialRow(p) {
  const city = S.trip?.cityEn || S.trip?.city || "";
  const name = p.local || p.name;
  return `<div class="chiprow social"><a class="chipbtn tt" href="${tiktokUrl(`${name} ${city}`)}" target="_blank" rel="noopener">${ic("play")}סרטונים בטיקטוק</a><a class="chipbtn ig" href="${igUrl(name)}" target="_blank" rel="noopener">${ic("camera")}תמונות באינסטגרם</a></div>`;
}
function socialCityCard(t) {
  const he = t.city, en = t.cityEn || t.cityLocal || t.city;
  const q = [[`${he} מסעדות`, "מסעדות (יוצרים ישראלים)"], [`${he} המלצות`, "המלצות בעברית"], [`${en} hidden gems`, "פינות נסתרות"], [`${en} street food`, "אוכל רחוב"], [`${en} must eat`, "חובה לאכול"], [`${en} things to do`, "מה לעשות"]];
  return `<div class="card socialcard"><h2>${ic("play")} מה ממליצים בטיקטוק ובאינסטגרם על ${esc(he)}</h2>
    <p>שם רואים איך המקום נראה באמת ומה אנשים מזמינים. פותחים חיפוש מוכן, ואם מצאתם מקום שאהבתם, מחפשים אותו במסע לפי שם ומוסיפים למסלול.</p>
    <div class="chiprow">${q.map(([x, l]) => `<a class="chipbtn tt" href="${tiktokUrl(x)}" target="_blank" rel="noopener">${ic("play")}${esc(l)}</a>`).join("")}</div>
    <div class="chiprow"><a class="chipbtn ig" href="${igUrl(en + "food")}" target="_blank" rel="noopener">${ic("camera")}#${esc(igTag(en + "food"))}</a><a class="chipbtn ig" href="${igUrl(en + "travel")}" target="_blank" rel="noopener">${ic("camera")}#${esc(igTag(en + "travel"))}</a><a class="chipbtn ig" href="${igUrl(en)}" target="_blank" rel="noopener">${ic("camera")}#${esc(igTag(en))}</a></div>
    <div class="disclaim">${ic("info")}<span>טיקטוק ואינסטגרם לא מאפשרים לאתרים אחרים לקרוא את הפוסטים אוטומטית, אז אנחנו פותחים לכם את החיפוש אצלם.</span></div></div>`;
}
function contactRow(p) {
  const items = [];
  items.push(`<a class="chipbtn" href="${reviewsUrl(p)}" target="_blank" rel="noopener">${ic("users")}ביקורות ותמונות בגוגל</a>`);
  if (p.website) items.push(`<a class="chipbtn" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("ext")}אתר</a>`);
  if (p.phone) items.push(`<a class="chipbtn" href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${ic("speech")}<bdi dir="ltr">${esc(p.phone)}</bdi></a>`);
  return `<div class="chiprow">${items.join("")}</div>${p.isHotel ? "" : socialRow(p)}${p.address ? `<div class="hoursrow">${ic("pin")}<span><bdi dir="ltr">${esc(p.address)}</bdi></span></div>` : ""}`;
}
function renderChips() {
  const el = $("gchips");
  const show = !!S.trip && TRIP_SCREENS.includes(S.screen);
  el.hidden = !show;
  if (!show) return;
  const counts = Object.fromEntries(CHIPS.map(([k, , kinds]) => [k, (S.trip.places || []).filter(p => kinds.includes(p.kind)).length]));
  el.innerHTML = CHIPS.filter(([k]) => counts[k]).map(([k, label, , icon]) => `<button type="button" data-chip="${k}" aria-pressed="${S.screen === "list" && S.list.chip === k && !S.list.q}">${ic(icon)}${label}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => openList(b.dataset.chip));
}
function openList(chip, q = "") {
  if (!["list", "poi"].includes(S.screen)) S.prevTrip = S.screen;
  S.list = { chip, sort: chip === "hotel" ? "fit" : "best", open: false, cuisine: null, price: null, diet: null, stars: 0, htype: null, q, page: 1 };
  go("list");
}
function listItems() {
  const L2 = S.list, all = S.trip?.places || [];
  let items;
  if (L2.q) {
    const q = L2.q.toLowerCase();
    items = all.filter(p => [p.name, p.local, cuisineHe(p.cuisine), p.cuisine, planner.KIND[p.kind]?.he].some(x => String(x || "").toLowerCase().includes(q)));
  } else {
    const kinds = CHIPS.find(c => c[0] === L2.chip)?.[2] || [];
    items = all.filter(p => kinds.includes(p.kind));
  }
  if (L2.cuisine) items = items.filter(p => cuisineList(p.cuisine).includes(L2.cuisine));
  if (L2.price) items = items.filter(p => p.priceClass === L2.price);
  if (L2.diet === "veg") items = items.filter(p => p.veg);
  if (L2.diet === "kosher") items = items.filter(p => p.kosher);
  if (L2.open) items = items.filter(p => openState(p) === true);
  if (L2.stars) items = items.filter(p => (p.stars || 0) >= L2.stars);
  if (L2.htype) items = items.filter(p => p.kind === L2.htype);
  if (L2.acc) items = items.filter(p => p.wheel === "yes" || p.wheel === "limited");
  const ref = S.me && km(S.me, S.trip) < 50 ? S.me : S.trip.days[S.day]?.stops?.[S.stop] || S.trip;
  items = items.map(p => ({ ...p, _d: km(ref, p) }));
  if (L2.sort === "fit") { const c = tripCenter(); items.forEach(p => { p._fit = km(c, p); }); items.sort((a, b) => (b.q - b._fit * 4) - (a.q - a._fit * 4)); }
  else items.sort(L2.sort === "near" ? (a, b) => a._d - b._d : (a, b) => (b.q - b._d * 0.4) - (a.q - a._d * 0.4));
  return items;
}
const fmtDist = d => d < 1 ? `${Math.round(d * 1000 / 10) * 10} מ׳` : `${d.toFixed(1)} ק״מ`;
function placeCard(p, i) {
  const o = openState(p);
  const inTrip = S.trip.days.some(d => d.stops.some(s => s.osm === p.id || s.name === p.name));
  return `<article class="pcard" data-i="${i}">
    <button type="button" class="pmain" data-open="${i}">
      <span class="ic" style="background:${cv(CATS[catOf(p)].c)}">${ic(CHIP_ICON[p.kind] || catOf(p))}</span>
      <span style="min-width:0">
        <span class="t">${esc(p.name)}${isVisited(p) ? ` <span class="tag new">הייתם כאן</span>` : ""}${p.wheel === "yes" ? ` <span class="acc" title="נגיש לכיסא גלגלים" aria-label="נגיש לכיסא גלגלים">${ic("access")}</span>` : ""}</span>
        <span class="pline">${[planner.KIND[p.kind]?.he, p.stars ? "★".repeat(Math.min(5, Math.round(p.stars))) : "", cuisineHe(p.cuisine), p.kind === "street" ? `${p.shops} חנויות` : ""].filter(Boolean).map(esc).join(" · ")}${priceLabel(p) ? ` · ${priceLabel(p)}` : p.priceClass ? ` · ${PRICE[p.priceClass]}` : ""}${o === true ? ` · <b class="open">פתוח עכשיו</b>` : o === false ? ` · <b class="closed">סגור</b>` : ""}</span>
        ${p.signals?.length ? `<span class="sigs small">${p.signals.slice(0, 3).map(x => `<span>${esc(x)}</span>`).join("")}</span>` : ""}
        ${p.vtext ? `<span class="vtext" dir="ltr" lang="en">${esc(p.vtext.slice(0, 140))}${p.vtext.length > 140 ? "…" : ""}</span>` : p.vtext2 ? `<span class="vtext">${esc(p.vtext2)}</span>` : ""}
      </span>
      <span class="dist">${p._fit != null && HOTEL_KINDS.includes(p.kind) ? `${fmtDist(p._fit)}<small>ממרכז המסלול</small>` : fmtDist(p._d)}</span>
    </button>
    ${HOTEL_KINDS.includes(p.kind) ? `<div class="pact">
      ${S.trip.hotel?.id === p.id ? `<span class="tag new">המלון שלכם</span>` : `<button type="button" class="btn small" data-pickhotel="${i}">${ic("bed")}בחירה כמלון שלי</button>`}
      <a class="btn small coral" href="${bookingUrl(p)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("ext")}Booking</a>
      <a class="btn small soft" href="${reviewsUrl(p)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("users")}ביקורות</a>
    </div>` : `<div class="pact">
      ${S.replace && !inTrip ? `<button type="button" class="btn small coral" data-repl="${i}">${ic("check")}לבחור במקום ${esc(S.replace.name.slice(0, 18))}</button>`
        : inTrip ? `<span class="tag new">${S.replace && S.replace.name === p.name ? "זה המקום שמחליפים" : "במסלול"}</span>` : `<button type="button" class="btn small" data-addp="${i}">${ic("plus")}למסלול</button>`}
      <a class="btn small soft" href="${gmDir(S.me || S.trip.days[S.day]?.stops?.[S.stop] || S.trip, p)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("nav")}ניווט</a>
      <a class="btn small soft" href="${reviewsUrl(p)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("users")}ביקורות</a>
    </div>`}
  </article>`;
}
SCREENS.list = {
  view() {
    const L2 = S.list, all = listItems();
    const chip = CHIPS.find(c => c[0] === L2.chip);
    const title = L2.q ? `תוצאות עבור "${esc(L2.q)}"` : `${chip?.[1] || "מקומות"} ב${esc(S.trip.city)}`;
    const base = L2.q ? all : (S.trip.places || []).filter(p => (chip?.[2] || []).includes(p.kind));
    const cuisines = Object.entries(base.flatMap(p => cuisineList(p.cuisine)).reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const showFood = ["food", "cafe", "dessert"].includes(L2.chip) || L2.q;
    const hasPrice = base.some(p => p.priceClass);
    const now = cityNow();
    const shown = all.slice(0, L2.page * 25);
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backList" aria-label="חזרה">${ic("back")}</button><span class="eyebrow">${all.length} מקומות</span><span style="width:38px"></span></div>
    <h1 style="font-size:1.5rem">${title}</h1>
    ${L2.chip === "hotel" && !L2.q ? myHotelCard() : ""}
    ${S.replace ? `<div class="tipbox swapbar">${ic("search")}<span>בוחרים מקום במקום <b>${esc(S.replace.name)}</b> (${esc(S.replace.mealHe || "")}). לוחצים על "לבחור" ליד המקום שרוצים.</span><button type="button" class="btn small soft" id="cancelSwap">ביטול</button></div>` : ""}
    ${L2.chip !== "hotel" ? `<form id="nameSearch" class="search small">${ic("search")}<input id="nameIn" type="search" value="${esc(L2.q || "")}" placeholder="חיפוש לפי שם, למשל ${L2.chip === "food" ? "U Fleků" : "שם המקום"}" aria-label="חיפוש לפי שם" autocomplete="off"><button class="btn small" type="submit">חיפוש</button></form>` : ""}
    <div class="filters">
      ${L2.chip === "hotel" ? `<button type="button" data-sort="fit" aria-pressed="${L2.sort === "fit"}">הכי מתאים למסלול</button>` : ""}
      <button type="button" data-sort="best" aria-pressed="${L2.sort === "best"}">הכי מומלץ</button>
      <button type="button" data-sort="near" aria-pressed="${L2.sort === "near"}">${S.me ? "הכי קרוב אליי" : "הכי קרוב למסלול"}</button>
      ${now && L2.chip !== "hotel" ? `<button type="button" id="fOpen" aria-pressed="${L2.open}">פתוח עכשיו</button>` : ""}
      ${hasPrice ? ["budget", "mid", "splurge"].map(k => `<button type="button" data-price="${k}" aria-pressed="${L2.price === k}">${PRICE[k]}</button>`).join("") : ""}
      ${L2.chip === "hotel" ? `<button type="button" data-stars="3" aria-pressed="${L2.stars === 3}">3 כוכבים ומעלה</button><button type="button" data-stars="4" aria-pressed="${L2.stars === 4}">4 כוכבים ומעלה</button>${["hotel", "hostel", "apartment", "guesthouse"].filter(k => base.some(p => p.kind === k)).map(k => `<button type="button" data-ht="${k}" aria-pressed="${L2.htype === k}">${planner.KIND[k].he}</button>`).join("")}` : ""}
      ${base.some(p => p.wheel === "yes") ? `<button type="button" id="fAcc" aria-pressed="${!!L2.acc}">${ic("access")}נגיש</button>` : ""}
      ${showFood ? `<button type="button" data-diet="veg" aria-pressed="${L2.diet === "veg"}">צמחוני</button><button type="button" data-diet="kosher" aria-pressed="${L2.diet === "kosher"}">כשר</button>` : ""}
    </div>
    ${cuisines.length > 1 && showFood ? `<div class="filters scroll-x">${cuisines.map(([c, n]) => `<button type="button" data-cu="${esc(c)}" aria-pressed="${L2.cuisine === c}">${esc(CUISINE_HE[c] || c.replace(/_/g, " "))} <small>${n}</small></button>`).join("")}</div>` : ""}
    ${L2.chip === "hotel" ? `<div class="disclaim">${ic("info")}<span>הדירוג לפי כוכבים, המלצות Wikivoyage, המרחק ממרכז המסלול והתקציב שבחרתם. מחירים וזמינות רואים באתרי ההזמנה.</span></div>` : `<div class="disclaim">${ic("info")}<span>הדירוג לפי סימני איכות פתוחים: המלצות Wikivoyage, כוכבי מישלן, מקום מוכר, מטבח מקומי ואתר פעיל. לדירוג כוכבים ולביקורות לחצו על "ביקורות".${now && !S.me ? ` "פתוח עכשיו" לפי השעה ב${esc(S.trip.city)}.` : ""}</span></div>`}
    ${L2.chip === "hotel" && !L2.q ? hotelIntro() : ""}
    <div class="plist">${shown.map(placeCard).join("") || `<p class="lead">${L2.q ? `לא מצאנו את "${esc(L2.q)}" ב${esc(S.trip.city)}.` : "לא נמצאו מקומות. נסו להוריד סינון."}</p>`}</div>
    ${L2.q ? cityWideResults(L2) : ""}
    ${L2.q ? `<button type="button" class="btn soft block" id="asDest">${ic("search")} לחפש את "${esc(L2.q)}" כיעד חדש</button>` : ""}
    ${all.length > shown.length ? `<button type="button" class="btn soft block" id="more">עוד ${Math.min(25, all.length - shown.length)} מקומות</button>` : ""}
    ${!L2.q && ["food", "bar", "mall"].includes(L2.chip) && (S.trip.voyageNoGeo || []).some(v => (CHIPS.find(c => c[0] === L2.chip)?.[2] || []).includes(v.kind)) ? `<div class="card"><h2>${ic("book")} עוד המלצות מ-Wikivoyage, בלי מיקום על המפה</h2>${S.trip.voyageNoGeo.filter(v => (CHIPS.find(c => c[0] === L2.chip)?.[2] || []).includes(v.kind)).slice(0, 12).map(v => `<div class="vrow"><b>${esc(v.name)}</b>${v.price ? ` <small>${esc(v.price)}</small>` : ""}${v.vtext ? `<p dir="ltr" lang="en">${esc(v.vtext.slice(0, 160))}</p>` : ""}<a href="${reviewsUrl(v)}" target="_blank" rel="noopener">חיפוש בגוגל מפות</a></div>`).join("")}</div>` : ""}
  </div>`;
  },
  bind() {
    const L2 = S.list;
    const refresh = (fly) => { L2.page = 1; rerenderKeepScroll(); renderMap(); if (fly) { const it = listItems().slice(0, 25); if (it.length) fitPoints(it, 16); } };
    $("backList").onclick = () => go(S.prevTrip || "plan");
    document.querySelectorAll("[data-sort]").forEach(b => b.onclick = () => { L2.sort = b.dataset.sort; refresh(false); });
    $("fOpen") && ($("fOpen").onclick = () => { L2.open = !L2.open; refresh(true); });
    $("fAcc") && ($("fAcc").onclick = () => { L2.acc = !L2.acc; refresh(true); });
    document.querySelectorAll("[data-price]").forEach(b => b.onclick = () => { L2.price = L2.price === b.dataset.price ? null : b.dataset.price; refresh(true); });
    $("editDates") && ($("editDates").onclick = () => { L2.editDates = true; rerenderKeepScroll(); });
    bindMyHotel();
    $("hSave") && ($("hSave").onclick = () => { S.trip.opts.start = $("hStart").value || S.trip.opts.start; S.trip.opts.people = Math.min(8, Math.max(1, +$("hPeople").value || 2)); L2.editDates = false; saveTrip(S.trip); rerenderKeepScroll(); toast("התאריכים עודכנו בקישורים להזמנה"); });
    document.querySelectorAll("[data-stars]").forEach(b => b.onclick = () => { L2.stars = L2.stars === +b.dataset.stars ? 0 : +b.dataset.stars; refresh(true); });
    document.querySelectorAll("[data-ht]").forEach(b => b.onclick = () => { L2.htype = L2.htype === b.dataset.ht ? null : b.dataset.ht; refresh(true); });
    document.querySelectorAll("[data-pickhotel]").forEach(b => b.onclick = () => chooseHotel(items[+b.dataset.pickhotel]));
    document.querySelectorAll("[data-diet]").forEach(b => b.onclick = () => { L2.diet = L2.diet === b.dataset.diet ? null : b.dataset.diet; refresh(true); });
    document.querySelectorAll("[data-cu]").forEach(b => b.onclick = () => { L2.cuisine = L2.cuisine === b.dataset.cu ? null : b.dataset.cu; refresh(true); });
    $("asDest") && ($("asDest").onclick = () => { S.dest = { q: L2.q, he: L2.q.split(",")[0].trim() }; go("goals"); });
    $("more") && ($("more").onclick = () => { L2.page++; rerenderKeepScroll(); renderMap(); });
    const items = listItems();
    document.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { S.poi = items[+b.dataset.open]; go("poi"); });
    document.querySelectorAll("[data-addp]").forEach(b => b.onclick = () => { addPlace(items[+b.dataset.addp]); rerenderKeepScroll(); });
    document.querySelectorAll("[data-repl]").forEach(b => b.onclick = () => replaceStop(items[+b.dataset.repl]));
    $("cancelSwap") && ($("cancelSwap").onclick = () => { S.replace = null; go("place"); });
    $("nameSearch") && ($("nameSearch").onsubmit = e => { e.preventDefault(); const v = $("nameIn").value.trim(); L2.q = v; L2.wide = null; L2.page = 1; rerenderKeepScroll(); renderMap(); });
    $("wideBtn") && ($("wideBtn").onclick = () => searchCityWide(L2));
    document.querySelectorAll("[data-wide]").forEach(b => b.onclick = () => {
      const p = L2.wide.results[+b.dataset.wide];
      if (S.replace) replaceStop(p); else { addPlace(p); rerenderKeepScroll(); }
    });
  }
};
/* a name that is not on our lists: search the whole city map */
const WIDE_KIND = { restaurant: "restaurant", fast_food: "restaurant", cafe: "cafe", bar: "bar", pub: "bar", nightclub: "club", ice_cream: "dessert", bakery: "bakery", museum: "museum", attraction: "attraction", gallery: "gallery", hotel: "hotel", hostel: "hostel", mall: "mall", department_store: "store", marketplace: "market" };
function cityWideResults(L2) {
  const W = L2.wide;
  if (!W) return `<button type="button" class="btn soft block" id="wideBtn">${ic("search")} לא מצאתם? חיפוש "${esc(L2.q)}" בכל המפה של ${esc(S.trip.city)}</button>`;
  if (W.loading) return `<div class="skeleton" style="height:60px"></div>`;
  if (!W.results.length) return `<p class="lead">גם במפה לא מצאנו את "${esc(L2.q)}". נסו כתיב אחר, באנגלית או בשפה המקומית.</p>`;
  return `<div class="card"><h2>${ic("pin")} נמצא במפה</h2>${W.results.map((p, i) => `<div class="hrow"><span><b>${esc(p.name)}</b><small>${esc(planner.KIND[p.kind]?.he || "")}${p.address ? " · " + esc(p.address) : ""} · ${fmtDist(km(S.trip, p))} מהמרכז</small></span><button type="button" class="btn small ${S.replace ? "coral" : ""}" data-wide="${i}">${S.replace ? "לבחור" : `${ic("plus")}למסלול`}</button></div>`).join("")}</div>`;
}
async function searchCityWide(L2) {
  const t = S.trip;
  L2.wide = { loading: true, results: [] }; rerenderKeepScroll();
  try {
    const r = await svc.searchNear(L2.q, +t.lat, +t.lng);
    L2.wide = { results: r.filter(x => km(t, x) < 40).map(x => { const kind = WIDE_KIND[x.type] || "restaurant"; return { id: `${x.osmType}/${x.osmId}`, name: x.name, local: x.local, kind, cat: planner.KIND[kind]?.cat || "food", lat: x.lat, lng: x.lng, address: x.address }; }) };
  } catch { L2.wide = { results: [] }; toast("החיפוש לא הצליח כרגע. נסו שוב בעוד רגע."); }
  if (S.screen === "list") rerenderKeepScroll();
}
/* swap a suggested meal for a place the traveler picked, keeping its time slot */
function replaceStop(p) {
  const R2 = S.replace, d = S.trip.days[R2.day], old = d?.stops[R2.stop];
  if (!old) { S.replace = null; return; }
  const ns = { ...old, name: p.name, local: p.local || p.name, kind: p.kind, kindHe: planner.KIND[p.kind]?.he, cat: p.cat || "food", lat: +p.lat, lng: +p.lng, osm: p.id,
    cuisine: p.cuisine || null, priceClass: p.priceClass || null, price: p.price || null, mich: p.mich || 0, wheel: p.wheel || null, signals: p.signals || [], hours: p.hours || null, phone: p.phone || null,
    address: p.address || null, website: p.website || null, why: p.vtext || planner.KIND[p.kind]?.he || "", whyLang: p.vtext ? "en" : "he", history: "", image: null, wikidata: null, nearby: [], tip: "", _added: true,
    booking: { needed: false, steps: [p.hours ? `שעות פתיחה: ${p.hours}` : "בודקים שעות פתיחה בגוגל מפות.", p.website ? "אפשר לבדוק באתר אם יש הזמנת שולחן." : "בערב במקומות מבוקשים כדאי להתקשר ולהזמין."], query: `${p.local || p.name} reservation`, url: p.website || null } };
  d.stops[R2.stop] = ns;
  d.route = null; d.legs = null;
  planner.assignTimes(d);
  S.replace = null;
  if (S.trip.source !== "sample") saveTrip(S.trip);
  S.day = R2.day; S.stop = R2.stop;
  toast(`${p.name} נכנס/ה במקום ${old.name}`);
  go("place");
  planner.computeRoute(d).then(() => { if (S.trip?.days.includes(d)) { renderMap(); if (["plan", "place"].includes(S.screen)) rerenderKeepScroll(); } });
}
function addPlace(p, dayIdx = S.day) {
  addToDay({ ...p, why: p.vtext || planner.KIND[p.kind]?.he || "", osm: p.id }, dayIdx);
  const d = S.trip.days[dayIdx], st = d.stops.find(s => s.name === p.name);
  if (st) Object.assign(st, { osm: p.id, kind: p.kind, kindHe: planner.KIND[p.kind]?.he, cuisine: p.cuisine, priceClass: p.priceClass, signals: p.signals || [], hours: p.hours, phone: p.phone, address: p.address, website: p.website, why: p.vtext || st.why, whyLang: p.vtext ? "en" : "he" });
}
SCREENS.poi = {
  view() {
    const p = S.poi;
    if (!p) return `<div class="screen"><p class="lead">לא נבחר מקום.</p></div>`;
    const o = openState(p);
    const dayOpts = S.trip.days.map((d, i) => `<option value="${i}" ${i === S.day ? "selected" : ""}>${esc(d.label)}</option>`).join("");
    const ref = S.me && km(S.me, S.trip) < 50 ? S.me : S.trip.days[S.day]?.stops?.[S.stop] || S.trip;
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backPoi" aria-label="חזרה לרשימה">${ic("back")}</button><span class="eyebrow">${esc(planner.KIND[p.kind]?.he || "")}</span><span style="width:38px"></span></div>
    <div class="placehero" style="background:linear-gradient(140deg,${cv(CATS[catOf(p)].c)},${cv("--violet")})"><span class="bigic">${ic(CHIP_ICON[p.kind] || catOf(p), 1.8)}</span>
      <h1>${esc(p.name)}</h1>${p.local && p.local !== p.name ? `<div class="local">${esc(p.local)}</div>` : ""}</div>
    <div class="pline big">${[...[p.stars ? "★".repeat(Math.min(5, Math.round(p.stars))) : "", cuisineHe(p.cuisine), p.priceClass ? PRICE[p.priceClass] : "", p.price || ""].filter(Boolean).map(esc), o === true ? `<b class="open">פתוח עכשיו</b>` : o === false ? `<b class="closed">סגור עכשיו</b>` : "", `${fmtDist(km(ref, p))} ממך`.replace(" ממך", S.me && km(S.me, S.trip) < 50 ? " ממך" : " מהמסלול")].filter(Boolean).join(" · ")}</div>
    ${p.signals?.length ? `<div class="sigs">${p.signals.map(x => `<span>${ic("check", 2.6)}${esc(x)}</span>`).join("")}</div>` : ""}
    ${priceInfo(p) ? `<div class="pricebox">${ic("coin")}<span>${HOTEL_KINDS.includes(p.kind) ? "מחיר משוער" : "כמה זה יעלה"}: ${priceLabel(p, true)}</span></div>` : ""}
    ${p.kind === "street" ? `<p>${esc(p.vtext2 || "")}</p><div class="linkrow">${p.ends ? `<a class="lnk primary" href="https://www.google.com/maps/dir/?api=1&origin=${p.ends[0][0]},${p.ends[0][1]}&destination=${p.ends[1][0]},${p.ends[1][1]}&travelmode=walking" target="_blank" rel="noopener">${ic("nav")}מסלול הליכה לאורך הרחוב</a>` : ""}</div>` : ""}
    ${p.vtext ? `<div class="vquote"><p dir="ltr" lang="en">${esc(p.vtext)}</p><div class="source">המלצה מתוך <a href="https://en.wikivoyage.org/wiki/${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}" target="_blank" rel="noopener">Wikivoyage</a>, ברישיון CC BY-SA</div></div>` : ""}
    ${contactRow(p)}
    ${HOTEL_KINDS.includes(p.kind) ? "" : brokerRow(p)}
    ${p.hours ? `<div class="hoursrow">${ic("clock")}<span>שעות פתיחה: <bdi dir="ltr" class="nowrap">${esc(p.hours)}</bdi></span></div>` : ""}
    ${S.replace && !HOTEL_KINDS.includes(p.kind) ? `<button type="button" class="btn coral block" id="poiRepl">${ic("check")} לבחור במקום ${esc(S.replace.name)}</button>` : ""}
    ${HOTEL_KINDS.includes(p.kind) ? hotelBook(p) : `<div class="card"><h2>${ic("plus")} הוספה למסלול</h2>
      <div class="keyrow"><select id="poiDay" class="select" style="flex:1">${dayOpts}</select><button type="button" class="btn" id="poiAdd">הוספה</button></div></div>`}
    <div class="linkrow">
      <a class="lnk primary" href="${gmDir(ref, p)}" target="_blank" rel="noopener">${ic("nav")}ניווט</a>
      <a class="lnk" href="${reviewsUrl(p)}" target="_blank" rel="noopener">${ic("pin")}בגוגל מפות</a>
    </div>
    <div class="disclaim">${ic("info")}<span>המידע מ-OpenStreetMap${p.vtext ? " ומ-Wikivoyage" : ""}. שעות ומחירים יכולים להשתנות.</span></div>
  </div>`;
  },
  bind() {
    $("backPoi").onclick = () => go("list", { noFly: true });
    $("pickHotel") && ($("pickHotel").onclick = () => chooseHotel(S.poi));
    $("dropHotel") && ($("dropHotel").onclick = clearHotel);
    $("otherHotels") && ($("otherHotels").onclick = () => openList("hotel"));
    $("poiRepl") && ($("poiRepl").onclick = () => replaceStop(S.poi));
    $("poiAdd") && ($("poiAdd").onclick = () => { const di = +$("poiDay").value; addPlace(S.poi, di); toast(`${S.poi.name} נוסף ל${S.trip.days[di].label}`); });
  }
};
/* the search bar on the map: a place in the current city, or a new destination */
$("gsearch").onsubmit = e => {
  e.preventDefault();
  const v = $("gq").value.trim();
  if (!v) return;
  $("gq").blur();
  if (S.trip && !Masa.cities.findCity(v)) {
    S.list = { chip: null, sort: "best", open: false, cuisine: null, price: null, diet: null, q: v, page: 1 };
    if (!["list", "poi"].includes(S.screen) && TRIP_SCREENS.includes(S.screen)) S.prevTrip = S.screen;
    go("list");
    return;
  }
  const known = DESTS.find(d => v.includes(d.he));
  S.dest = known || { q: v, he: v.split(",")[0].trim() };
  if (known) flyCenter(known, 11);
  go("goals");
};

/* ================= broker links: one tap to the site that books it ================= */
const cityName = () => S.trip?.cityEn || S.trip?.cityLocal || "";
function brokerRow(p) {
  const q = `${p.local || p.name} ${cityName()}`;
  if (["restaurant", "cafe"].includes(p.kind) || p.meal === "lunch" || p.meal === "dinner") {
    return `<div class="broker"><span>הזמנת שולחן</span><div class="chiprow">
      ${p.website ? `<a class="chipbtn" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("ext")}אתר המסעדה</a>` : ""}
      <a class="chipbtn" href="https://www.thefork.com/search?queryText=${encodeURIComponent(q)}" target="_blank" rel="noopener">${ic("ext")}TheFork</a>
      <a class="chipbtn" href="${reviewsUrl(p)}" target="_blank" rel="noopener">${ic("pin")}בגוגל מפות</a></div></div>`;
  }
  if (["museum", "gallery", "attraction", "sight", "zoo", "themepark", "view", "church"].includes(p.kind) || p.booking?.needed) {
    return `<div class="broker"><span>כרטיסים וסיורים</span><div class="chiprow">
      ${p.website ? `<a class="chipbtn" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("shield")}אתר רשמי</a>` : `<a class="chipbtn" href="${gSearch(`${p.local || p.name} official site tickets`)}" target="_blank" rel="noopener">${ic("shield")}חיפוש האתר הרשמי</a>`}
      <a class="chipbtn" href="https://www.getyourguide.com/s/?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${ic("ext")}GetYourGuide</a>
      <a class="chipbtn" href="https://www.tiqets.com/en/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${ic("ext")}Tiqets</a></div>
      <small class="muted">באתר הרשמי בדרך כלל הכי זול. באתרים האחרים יש סיורים מודרכים וכרטיסי דילוג על התור.</small></div>`;
  }
  return "";
}
function flightsUrl() {
  const { start, end, people } = tripDates();
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from TLV to ${cityName()} on ${dstr(start)} through ${dstr(end)} for ${people} adults`)}`;
}

/* ================= hotels: a broker to the booking sites ================= */
function tripCenter(t = S.trip) {
  const pts = t.days.flatMap(d => d.stops).filter(s => !s.isHotel && hasXY(s));
  if (!pts.length) return { lat: t.lat, lng: t.lng };
  return { lat: pts.reduce((a, p) => a + +p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + +p.lng, 0) / pts.length };
}
const dstr = d => isoDate(d);
function bookingUrl(p) {
  const { start, end, people } = tripDates();
  return `https://www.booking.com/searchresults.he.html?ss=${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}&latitude=${(+p.lat).toFixed(5)}&longitude=${(+p.lng).toFixed(5)}&radius=1&order=distance_from_search&checkin=${dstr(start)}&checkout=${dstr(end)}&group_adults=${people}&no_rooms=1&group_children=0`;
}
function hotelsComUrl(p) {
  const { start, end, people } = tripDates();
  return `https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent(`${p.local || p.name}, ${S.trip.cityEn || S.trip.cityLocal}`)}&startDate=${dstr(start)}&endDate=${dstr(end)}&adults=${people}`;
}
const googleHotelsUrl = p => `https://www.google.com/travel/search?q=${encodeURIComponent(`${p.local || p.name} ${S.trip.cityEn || S.trip.cityLocal}`)}`;
function airbnbAreaUrl() {
  const { start, end, people } = tripDates();
  const c = tripCenter(), dLat = 0.008, dLng = 0.011;
  return `https://www.airbnb.com/s/${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}/homes?checkin=${dstr(start)}&checkout=${dstr(end)}&adults=${people}&ne_lat=${(c.lat + dLat).toFixed(5)}&ne_lng=${(c.lng + dLng).toFixed(5)}&sw_lat=${(c.lat - dLat).toFixed(5)}&sw_lng=${(c.lng - dLng).toFixed(5)}&search_by_map=true`;
}
function bookingAreaUrl() {
  const { start, end, people } = tripDates();
  const c = tripCenter();
  return `https://www.booking.com/searchresults.he.html?ss=${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}&latitude=${c.lat.toFixed(5)}&longitude=${c.lng.toFixed(5)}&radius=2&order=distance_from_search&checkin=${dstr(start)}&checkout=${dstr(end)}&group_adults=${people}&no_rooms=1`;
}
/* "my hotel": the traveler already booked somewhere; find it by name or address, even if it is not on our list */
function myHotelCard() {
  const H = S.hotelSearch || {};
  const res = H.results || [];
  return `<div class="card myhotel"><h2>${ic("bed")} כבר הזמנתם מלון?</h2>
    <p>חפשו אותו לפי שם או כתובת, והמסלול ייבנה סביבו: כל יום יתחיל ויסתיים קרוב אליו.</p>
    <form id="myHotelForm" class="keyrow"><input id="myHotelIn" class="select" value="${esc(H.q || "")}" placeholder="שם המלון או הכתובת, למשל Hotel Paris Prague" aria-label="שם המלון או כתובת" autocomplete="off"><button class="btn small" type="submit">${ic("search")}חיפוש</button></form>
    ${H.loading ? `<div class="skeleton" style="height:44px"></div>` : ""}
    ${H.error ? `<div class="status">${esc(H.error)}</div>` : ""}
    ${res.length ? `<div class="hres">${res.map((r, i) => `<div class="hrow"><span><b>${esc(r.name)}</b><small>${esc(r.address || "")}${r.src === "list" ? " · מהרשימה שלנו" : ""} · ${fmtDist(km(S.trip, r))} מהמרכז</small></span><button type="button" class="btn small" data-myhotel="${i}">זה המלון שלי</button></div>`).join("")}</div>` : ""}
  </div>`;
}
async function searchMyHotel(q) {
  const t = S.trip, H = S.hotelSearch = { q, loading: true, results: [] };
  rerenderKeepScroll();
  const n = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const qn = n(q);
  // 1. our own list of hotels in this city
  const local = (t.places || []).filter(p => HOTEL_KINDS.includes(p.kind) && (n(p.name).includes(qn) || n(p.local).includes(qn) || (qn.length > 3 && qn.includes(n(p.local)))))
    .slice(0, 4).map(p => ({ ...p, src: "list" }));
  // 2. the whole map (any hotel, apartment or address)
  let far = [];
  try {
    const r = await svc.searchNear(q, +t.lat, +t.lng);
    // places to sleep, or a plain address (some booked apartments have no name on the map); not restaurants or shops
    far = r.filter(x => km(t, x) < 40 && !local.some(l => km(l, x) < 0.05) && (x.category === "tourism" ? /hotel|hostel|guest_house|apartment|motel|chalet/.test(x.type) : ["building", "place", "highway", "boundary"].includes(x.category)))
      .map(x => ({ id: `${x.osmType}/${x.osmId}`, name: x.name, local: x.local, kind: x.type === "hostel" ? "hostel" : x.type === "apartment" ? "apartment" : x.type === "guest_house" ? "guesthouse" : "hotel", cat: "sleep", lat: x.lat, lng: x.lng, address: x.address, src: "map", isAddress: x.category !== "tourism" }));
  } catch { if (!local.length) H.error = "החיפוש לא הצליח כרגע. נסו שוב בעוד רגע, או כתבו את הכתובת המלאה."; }
  H.loading = false;
  H.results = [...local, ...far].slice(0, 6);
  if (!H.results.length && !H.error) H.error = "לא מצאנו. נסו את השם כמו שהוא מופיע באישור ההזמנה, או את הכתובת (רחוב ומספר).";
  if (S.screen === "list") rerenderKeepScroll();
}
function bindMyHotel() {
  const f = $("myHotelForm");
  if (!f) return;
  f.onsubmit = e => { e.preventDefault(); const v = $("myHotelIn").value.trim(); if (v.length >= 2) searchMyHotel(v); };
  document.querySelectorAll("[data-myhotel]").forEach(b => b.onclick = () => {
    const r = S.hotelSearch.results[+b.dataset.myhotel];
    if (r.isAddress && !/hotel|hostel|apart|inn|suite|מלון/i.test(r.name)) r.name = `המלון שלי (${r.address || r.name})`;
    S.hotelSearch = null;
    chooseHotel(r);
  });
}
function hotelIntro() {
  const { start, end, people } = tripDates();
  return `<div class="card hotelintro"><h2>${ic("pin")} איפה הכי כדאי לישון?</h2>
    <p>המלונות מסודרים לפי המרחק ממרכז המסלול שלכם (מסומן במפה בכוכב) ולפי סימני איכות. מלון קרוב למרכז המסלול חוסך הליכה ונסיעות בכל יום.</p>
    ${S.list.editDates ? `<div class="keyrow"><input type="date" id="hStart" class="select" value="${isoDate(start)}" aria-label="תאריך הגעה"><input type="number" id="hPeople" class="select" min="1" max="8" value="${people}" aria-label="מטיילים" style="width:80px"><button type="button" class="btn small" id="hSave">עדכון</button></div>`
      : `<div class="pline">${fmtDay(start)} עד ${fmtDay(end)} · ${people} מטיילים · <button type="button" class="linkbtn" id="editDates">שינוי</button></div>`}
    <div class="chiprow"><a class="chipbtn" href="${bookingAreaUrl()}" target="_blank" rel="noopener">${ic("ext")}כל המלונות ב-Booking</a><a class="chipbtn" href="${airbnbAreaUrl()}" target="_blank" rel="noopener">${ic("ext")}דירות Airbnb ליד המסלול</a></div>
    <div class="disclaim">${ic("shield")}<span>מסע לא גובה עמלה ולא שומר פרטי תשלום. ההזמנה נעשית באתר שבוחרים.</span></div></div>`;
}
function hotelBook(p) {
  const c = tripCenter();
  const mins = Math.round(km(c, p) * 1.25 / 4.6 * 60);
  return `<div class="card"><h2>${ic("bed")} הזמנת חדר</h2>
    <p>${mins <= 20 ? `${mins} דקות הליכה ממרכז המסלול שלכם. מיקום מצוין.` : `${mins} דקות הליכה ממרכז המסלול. יש מלונות קרובים יותר, אבל אולי זה שווה את זה.`}</p>
    <div class="linkrow">
      <a class="lnk primary" href="${bookingUrl(p)}" target="_blank" rel="noopener">${ic("ext")}Booking</a>
      <a class="lnk" href="${hotelsComUrl(p)}" target="_blank" rel="noopener">${ic("ext")}השוואה ב-Hotels.com</a>
      <a class="lnk" href="${googleHotelsUrl(p)}" target="_blank" rel="noopener">${ic("search")}השוואת מחירים בגוגל</a>
      ${p.website ? `<a class="lnk" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("shield")}אתר המלון</a>` : `<a class="lnk" href="${reviewsUrl(p)}" target="_blank" rel="noopener">${ic("users")}ביקורות</a>`}
    </div>
    ${S.trip.hotel?.id === p.id ? `<div class="keyrow"><span class="tag new">זה המלון שלכם</span><button type="button" class="btn small soft" id="dropHotel">הסרת המלון מהמסלול</button><button type="button" class="btn small soft" id="otherHotels">מלונות אחרים</button></div>` : `<button type="button" class="btn block" id="pickHotel">${ic("bed")} בחירה כמלון שלי ובניית המסלול סביבו</button>`}
  </div>`;
}
/* build the trip again with one setting changed, keeping the hotel, the family notes and the trip id */
async function rebuildWith(change, msg) {
  const t = S.trip;
  if (!t?.opts) return;
  toast("מסדרים את המסלול מחדש…");
  try {
    const nt = await planner.build({ ...t.opts, ...memoryOpts(), hotel: t.hotel || null, ...change }, () => {}, null);
    nt.id = t.id; nt.fam = t.fam || null;
    saveTrip(nt); openTrip(nt);
    if (msg) toast(msg);
  } catch { toast("לא הצלחנו לסדר מחדש. נסו שוב."); }
}
async function chooseHotel(p) {
  const t = S.trip;
  if (!p || !t?.opts) return;
  toast("מסדרים את המסלול מחדש סביב המלון…");
  try {
    const nt = await planner.build({ ...t.opts, hotel: p ? { id: p.id, name: p.name, local: p.local, kind: p.kind, lat: p.lat, lng: p.lng, stars: p.stars, priceClass: p.priceClass, website: p.website, phone: p.phone, address: p.address, signals: p.signals, q: p.q } : null }, () => {}, null);
    nt.id = t.id; nt.fam = t.fam || null;
    saveTrip(nt);
    openTrip(nt);
    toast(`כל יום יוצא עכשיו מ${p.name}`);
  } catch (e) { toast("לא הצלחנו לסדר מחדש. נסו שוב."); }
}
async function clearHotel() {
  const t = S.trip;
  if (!t?.opts) return;
  const nt = await planner.build({ ...t.opts, hotel: null }, () => {}, null);
  nt.id = t.id; nt.fam = t.fam || null; saveTrip(nt); openTrip(nt); toast("המלון הוסר מהמסלול");
}

/* ================= practical info for abroad ================= */
const WCODE = c => c == null ? "" : c === 0 ? "בהיר" : c <= 3 ? "מעונן חלקית" : c <= 48 ? "ערפל" : c <= 57 ? "טפטוף" : c <= 67 ? "גשם" : c <= 77 ? "שלג" : c <= 82 ? "ממטרים" : "סופת רעמים";
function tzOffsetHours(tz) {
  try {
    const now = new Date();
    const a = new Date(now.toLocaleString("en-US", { timeZone: tz })), b = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    return Math.round((a - b) / 36e5 * 2) / 2;
  } catch { return null; }
}
const infoCache = {};
SCREENS.info = {
  view() {
    const t = S.trip, ci = COUNTRY_INFO[t.cc] || null;
    const key = `${t.lat},${t.lng}`;
    const c = infoCache[key] || {};
    const { start } = tripDates();
    const off = t.tz ? tzOffsetHours(t.tz) : null;
    let wx = "";
    if (c.weather === undefined) wx = `<div class="skeleton"></div>`;
    else if (!c.weather) wx = `<p class="lead">לא הצלחנו לטעון תחזית כרגע.</p>`;
    else {
      const inRange = c.weather.filter(d => d.date >= isoDate(start)).slice(0, t.days.length || 3);
      const days = inRange.length ? inRange : c.weather.slice(0, 7);
      wx = `${inRange.length ? "" : `<p class="lead">התחזית לימי הטיול תופיע כשבועיים לפני. בינתיים, השבוע הקרוב ב${esc(t.city)}:</p>`}
        <div class="wx">${days.map(d => `<div><small>${fmtDay(new Date(d.date + "T12:00:00"))}</small><b>${Math.round(d.max)}°</b><span>${Math.round(d.min)}°</span><em>${WCODE(d.code)}</em>${d.rain != null ? `<i>${d.rain}% גשם</i>` : ""}</div>`).join("")}</div>`;
    }
    let money = "";
    if (ci) {
      if (c.rate === undefined) money = `<div class="skeleton" style="height:40px"></div>`;
      else if (!c.rate) money = `<p class="lead">שער החליפין לא זמין כרגע.</p>`;
      else money = `<div class="conv"><label><input id="convLocal" type="number" inputmode="decimal" value="10" class="select" aria-label="סכום ב${esc(ci.curHe)}"><span>${esc(ci.cur)}</span></label><b>=</b><output id="convILS">${(10 * c.rate.rate).toFixed(1)} ₪</output></div>
        <div class="source">1 ${esc(ci.cur)} = ${c.rate.rate.toFixed(3)} ₪, לפי ${esc(c.rate.src || "הבנק המרכזי האירופי")} (${esc(c.rate.date)})</div>`;
    }
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backInfo" aria-label="חזרה">${ic("back")}</button><span class="eyebrow">לפני שטסים</span><span style="width:38px"></span></div>
    <h1 style="font-size:1.5rem">מה צריך לדעת ב${esc(t.country || t.city)}</h1>
    <div class="card"><h2>${ic("nav")} טיסות</h2><p>חיפוש טיסות מתל אביב ל${esc(t.city)} בתאריכים של הטיול, בהשוואת מחירים של גוגל.</p>
      <div class="chiprow"><a class="chipbtn" href="${flightsUrl()}" target="_blank" rel="noopener">${ic("ext")}טיסות ב-Google Flights</a><a class="chipbtn" href="https://www.skyscanner.co.il/" target="_blank" rel="noopener">${ic("ext")}Skyscanner</a></div></div>
    <div class="card"><h2>${ic("sun")} מזג אוויר</h2>${wx}</div>
    ${ci ? `<div class="card"><h2>${ic("coin")} כסף: ${esc(ci.curHe)}</h2>${money}<p>${esc(ci.pay)}</p></div>` : ""}
    ${esimCard(t)}
    <div class="factgrid">
      ${ci ? `<div><small>${ic("info")}חירום</small><b>${esc(ci.sos)}</b></div>` : `<div><small>${ic("info")}חירום באירופה</small><b>112</b></div>`}
      ${off != null ? `<div><small>${ic("clock")}הפרש שעות מישראל</small><b>${off === 0 ? "אותה שעה" : `${off > 0 ? "+" : ""}${off} שעות`}</b></div>` : ""}
      ${ci ? `<div><small>${ic("plug")}שקעים</small><b>${esc(ci.plug)} · ${esc(ci.volt)}</b></div>` : ""}
      ${ci ? `<div><small>${ic("food")}טיפ</small><b class="sm">${esc(ci.tip)}</b></div>` : ""}
      ${ci ? `<div><small>${ic("nature")}מי ברז</small><b class="sm">${esc(ci.water)}</b></div>` : ""}
    </div>
    ${ci?.extra ? `<div class="tipbox">${ic("bulb")}<span>${esc(ci.extra)}</span></div>` : ""}
    ${ci?.plug && !/H/.test(ci.plug) ? `<div class="tipbox">${ic("plug")}<span>התקע הישראלי לא תמיד נכנס לשקעים כאן. קחו מתאם${/C/.test(ci.plug) ? " (תקע עגול דק מסוג C מתאים לרוב המכשירים)" : ""}.</span></div>` : ""}
    <div class="card"><h2>${ic("speech")} משפטים בשפה המקומית</h2><p class="lead">בלשונית "גלו" יש משפטים שימושיים עם השמעה.</p><button type="button" class="btn small soft" id="toPhr">${ic("compass")} למשפטים</button></div>
    <div class="disclaim">${ic("info")}<span>המידע כללי ונכון לזמן הכתיבה. לפני הטיסה בדקו גם את המלצות משרד החוץ ואת דרישות הכניסה למדינה.</span></div>
  </div>`;
  },
  bind() {
    const t = S.trip, ci = COUNTRY_INFO[t.cc];
    const key = `${t.lat},${t.lng}`;
    const c = infoCache[key] = infoCache[key] || {};
    $("backInfo").onclick = () => go("plan");
    $("toPhr").onclick = () => go("discover");
    if (c.weather === undefined) svc.weather(+t.lat, +t.lng).then(w => { c.weather = w; if (S.screen === "info") rerenderKeepScroll(); });
    if (ci && c.rate === undefined) svc.rateToILS(ci.cur).then(r => { c.rate = r; if (S.screen === "info") rerenderKeepScroll(); });
    $("convLocal") && ($("convLocal").oninput = e => { const v = parseFloat(e.target.value) || 0; $("convILS").textContent = `${(v * c.rate.rate).toFixed(1)} ₪`; });
  }
};

/* ================= getting there and around ================= */
const TR = Masa.transport;
function legRow(t, a, b, L2) {
  if (L2.mode === "car") return `<div class="leg">${ic("car")} ${L2.kmv.toFixed(1)} ק״מ · כ-${L2.min} דק׳ נסיעה וחניה · <a href="${gmDir(a, b, "driving")}" target="_blank" rel="noopener">ניווט ברכב</a></div>`;
  if (L2.mode === "transit") return `<div class="leg">${ic("bus")} ${L2.kmv.toFixed(1)} ק״מ · כ-${L2.min} דק׳ בתחבורה ציבורית · <a href="${gmDir(a, b, "transit")}" target="_blank" rel="noopener">איזה קו לוקחים</a></div>`;
  const nav = `<a href="${gmDir(a, b, L2.transit ? "transit" : "walking")}" target="_blank" rel="noopener">ניווט</a>`;
  const mob = t.opts?.mobility;
  const far = L2.min > (mob ? 12 : 25);
  let extra = "";
  if (far) {
    const tx = TR.taxi(t.slug, t.cc, L2.kmv);
    const apps = (TR.city(t.slug)?.apps || []);
    const uber = apps.includes("Uber") ? `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${a.lat}&pickup[longitude]=${a.lng}&dropoff[latitude]=${b.lat}&dropoff[longitude]=${b.lng}` : null;
    extra = `<span class="legopts"><a href="${gmDir(a, b, "transit")}" target="_blank" rel="noopener">${ic("bus")}תחבורה ציבורית</a>${tx ? `<span>${ic("car")}מונית כ-${money(COST.ils(tx))}${uber ? ` · <a href="${uber}" target="_blank" rel="noopener">Uber</a>` : apps.length ? ` · ${esc(apps.slice(0, 2).join(" / "))}` : ""}</span>` : ""}</span>`;
  }
  return `<div class="leg">${ic(L2.transit ? "train" : "nav")} ${L2.kmv.toFixed(1)} ק״מ · ${L2.transit ? "רחוק להליכה" : `${L2.min} דק׳ הליכה`} · ${nav}${extra}</div>`;
}
SCREENS.move = {
  view() {
    const t = S.trip, mob = t.opts?.mobility, fam = (t.opts?.people || 2) >= 3;
    const groups = TR.airport(t.slug, { mobility: !!mob, family: fam });
    const c = TR.city(t.slug);
    const row = o => `<div class="mvrow${o.easy ? " easy" : ""}"><span class="ic" style="background:${cv(o.m === "taxi" ? "--coral" : o.m === "bus" ? "--sky" : "--violet")}">${ic(TR.MODE_IC[o.m] || "bus")}</span>
      <span class="mvmain"><b>${esc(o.n)}</b><small>${esc(TR.MODE_HE[o.m] || "")} · ${o.min} דק׳ · עד ${esc(o.to)}</small>${o.note ? `<small class="mvnote">${esc(o.note)}</small>` : ""}
      <span class="mvtags">${o.easy ? `<span class="tag new">הכי נוח</span>` : ""}${o.cheap ? `<span class="tag free">הכי זול</span>` : ""}${o.fast && !o.easy ? `<span class="tag">הכי מהיר</span>` : ""}</span></span>
      <span class="mvprice"><b>${money(esc(o.p))}</b><small>כ-${money(COST.ils(o.eur))}${o.m === "taxi" ? " למונית" : " לאדם"}</small></span></div>`;
    const airportLink = code => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(code + " airport")}&destination=${t.lat},${t.lng}&travelmode=transit`;
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backMove" aria-label="חזרה">${ic("back")}</button><span class="eyebrow">תחבורה</span><span style="width:38px"></span></div>
    <h1 style="font-size:1.5rem">איך מגיעים ומתניידים ב${esc(t.city)}</h1>
    ${groups ? groups.map(g => {
      const easy = g.list.find(o => o.easy), cheap = g.list.find(o => o.cheap);
      return `<div class="card"><h2>${ic("nav")} משדה התעופה ${esc(g.he)} (${esc(g.code)}) לעיר</h2>
      <p class="lead">${easy ? `<b>הכי נוח:</b> ${esc(easy.n)}${mob ? " (עם כיסא גלגלים, עגלה או קושי בהליכה, מונית מהשדה היא הכי פשוטה)" : fam ? " (עם ילדים ומזוודות, מונית שווה את ההפרש)" : ""}.` : ""} ${cheap && cheap !== easy ? `<b>הכי זול:</b> ${esc(cheap.n)}.` : ""}</p>
      <div class="mvlist">${g.list.map(row).join("")}</div>
      <a class="chipbtn" href="${airportLink(g.code)}" target="_blank" rel="noopener">${ic("pin")}מסלול מהשדה בגוגל מפות</a></div>`;
    }).join("") : `<div class="card"><h2>${ic("nav")} משדה התעופה לעיר</h2><p>עוד אין לנו פירוט לעיר הזאת. בגוגל מפות רואים את כל האפשרויות מהשדה הקרוב.</p>
      <a class="chipbtn" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${t.cityEn || t.city} airport`)}&destination=${t.lat},${t.lng}&travelmode=transit" target="_blank" rel="noopener">${ic("pin")}מהשדה לעיר בגוגל מפות</a></div>`}
    <div class="card"><h2>${ic("bus")} בתוך העיר</h2>
      ${c?.note ? `<p>${esc(c.note)}</p>` : ""}
      <div class="mvtips">
        <div><b>${ic("heart")}הכי נוח</b><span>במרכז הולכים ברגל, וכשהמרחק יותר מ-2 ק״מ לוקחים מונית באפליקציה. המחיר ידוע מראש ואין צורך לדבר בשפה המקומית.${(c?.apps || []).length ? ` כאן עובדים: ${esc(c.apps.join(", "))}.` : ""}</span></div>
        <div><b>${ic("coin")}הכי זול</b><span>${esc(c?.pass || "תחבורה ציבורית עם כרטיס יומי או כרטיס נטען. בהרבה ערים אפשר לשלם בכרטיס אשראי ישירות בשער.")}</span></div>
        ${c?.km ? `<div><b>${ic("car")}כמה עולה מונית</b><span>כ-${money(COST.ils(c.flag + c.km * 3))} לנסיעה של 3 ק״מ בעיר. במסלול שלכם, כשתחנה רחוקה להליכה, מופיעה הערכה למונית ולתחבורה ציבורית.</span></div>` : ""}
      </div></div>
    ${mob ? `<div class="tipbox">${ic("access")}<span>${mob === "stroller" ? "עם עגלה: בהרבה תחנות מטרו ישנות אין מעלית. אוטובוסים וחשמליות בדרך כלל נוחים יותר." : "בהרבה תחנות מטרו ישנות אין מעלית. אוטובוסים וחשמליות חדשים בדרך כלל נגישים. מונית עם רמפה כדאי להזמין יום מראש דרך המלון."} באפליקציה של התחבורה בעיר אפשר לסנן מסלול בלי מדרגות.</span></div>` : ""}
    <div class="disclaim">${ic("info")}<span>רוב המחירים נבדקו מול מקורות עדכניים באוקטובר 2026, אבל הם משתנים. לפני הטיסה כדאי לבדוק באתר של שדה התעופה או של חברת התחבורה.</span></div>
  </div>`;
  },
  bind() { $("backMove").onclick = () => go("plan"); }
};

/* ================= internet abroad: eSIM ================= */
const EU = new Set(["it", "fr", "es", "pt", "de", "at", "nl", "gr", "cz", "hu", "cy", "pl", "bg", "ro", "ie", "dk", "be", "hr", "si", "sk", "se", "fi", "ee", "lv", "lt", "lu", "mt"]);
function esimCard(t) {
  const days = t.days.length + 2; // the flight days too
  const need = days * 0.8;
  const gb = [3, 5, 10, 20].find(x => x >= need) || 20;
  const cc = t.cc;
  const region = EU.has(cc) ? "חבילת \"אירופה\" מכסה את רוב מדינות האיחוד, כך שאפשר להשתמש בה גם בטיול לכמה מדינות."
    : cc === "gb" ? "בריטניה לא באיחוד האירופי. ודאו שחבילת \"אירופה\" כוללת אותה, או קנו חבילה לבריטניה."
    : ["ge", "tr", "rs", "ae", "us", "th", "jp"].includes(cc) ? `קנו חבילה ל${esc(t.country)} עצמה. חבילות "אירופה" לא תמיד כוללות אותה.`
    : `קנו חבילה ל${esc(t.country || "מדינה")} או לאזור שלה.`;
  const prov = [["Airalo", "https://www.airalo.com/"], ["Saily", "https://saily.com/"], ["Nomad", "https://www.getnomad.app/"], ["Holafly", "https://esim.holafly.com/"]];
  return `<div class="card esimcard"><h2>${ic("sim")} אינטרנט בחו״ל: eSIM</h2>
    <p>eSIM הוא כרטיס סים דיגיטלי. קונים חבילת גלישה באינטרנט, סורקים קוד, והטלפון מתחבר לרשת המקומית ברגע הנחיתה. בדרך כלל זה זול בהרבה מחבילת חו״ל של החברה הישראלית.</p>
    <div class="esimcmp">
      <div><small>חבילת חו״ל של חברה ישראלית</small><b>כ-${money("₪199")}</b><span>ל-5–10GB</span></div>
      <div class="good"><small>eSIM בינלאומי</small><b>כ-${money("₪50–75")}</b><span>ל-5GB לחודש</span></div>
      <div><small>eSIM בלי הגבלה</small><b>כ-${money("₪110–150")}</b><span>לשבוע עד 10 ימים</span></div>
    </div>
    <div class="tipbox">${ic("bulb")}<span>לטיול של ${t.days.length} ${t.days.length === 1 ? "יום" : "ימים"} מספיקה בדרך כלל חבילה של <b>${gb}GB</b> (מפות, וואטסאפ, תמונות). ${region}</span></div>
    <ol class="howto">
      <li><b>בודקים שהטלפון תומך:</b> בהגדרות, תחת סים או רשת סלולרית, מחפשים "הוספת eSIM". נתמך באייפון XS ומעלה, גלקסי S20 ומעלה ופיקסל 3 ומעלה. הטלפון צריך להיות פתוח לכל הרשתות.</li>
      <li><b>קונים ומתקינים בבית,</b> יום-יומיים לפני הטיסה, כשיש Wi-Fi. סורקים את הקוד שמקבלים במייל. החבילה מתחילה לרוץ רק כשמגיעים ליעד (ברוב החברות).</li>
      <li><b>משאירים את הקו הישראלי פעיל</b> כדי לקבל SMS (קודים מהבנק), אבל <b>מכבים בו נדידת נתונים</b> (Data Roaming), כדי לא לשלם לחברה הישראלית.</li>
      <li><b>כשנוחתים:</b> בוחרים את ה-eSIM לנתונים הסלולריים ומפעילים בו נדידת נתונים. וואטסאפ ממשיך לעבוד עם המספר הישראלי.</li>
    </ol>
    <div class="chiprow">${prov.map(([n, u]) => `<a class="chipbtn" href="${u}" target="_blank" rel="noopener">${ic("ext")}${n}</a>`).join("")}<a class="chipbtn" href="https://esimdb.com/" target="_blank" rel="noopener">${ic("search")}השוואת מחירים (eSIMDB)</a></div>
    <div class="disclaim">${ic("info")}<span>מחירים לדוגמה מהשוואות שפורסמו בשנה האחרונה, והם משתנים. יש גם eSIM של חברות ישראליות (למשל Tuki של פלאפון). מסע לא מקבל עמלה על הקישורים.</span></div>
  </div>`;
}

/* ================= accessibility and display ================= */
const A11Y = Object.assign({ size: "100", hc: false, still: false, links: false }, store.get("masa-a11y", {}));
function applyA11y() {
  const r = document.documentElement;
  r.style.fontSize = A11Y.size === "100" ? "" : A11Y.size + "%";
  r.classList.toggle("hc", !!A11Y.hc);
  r.classList.toggle("ul", !!A11Y.links);
  reduced = !!A11Y.still || matchMedia("(prefers-reduced-motion: reduce)").matches;
  store.set("masa-a11y", A11Y);
}

/* ================= memory: where you have been and what you like ================= */
const me = Object.assign({ name: "", visited: {}, form: null }, store.get("masa-me", {}));
const saveMe = () => store.set("masa-me", me);
const placeKey = s => s.osm || `${String(s.local || s.name || "").toLowerCase()}@${(+s.lat).toFixed(3)},${(+s.lng).toFixed(3)}`;
const isVisited = s => !!(s && me.visited[placeKey(s)]);
function memoryOpts() {
  const v = Object.entries(me.visited);
  const cu = {};
  v.forEach(([, x]) => (x.cuisine || "").split(";").filter(Boolean).forEach(c => { cu[c] = (cu[c] || 0) + 1; }));
  return { visited: v.map(([k, x]) => [k, x.local || x.name]).flat(), likeCuisines: Object.entries(cu).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]) };
}
function rememberForm(f) { me.form = { interests: f.interests, budget: f.budget, diet: f.diet, pace: f.pace, mobility: f.mobility || "", move: f.move || "walk", people: f.people }; saveMe(); }
function markVisited(s, on) {
  const k = placeKey(s);
  if (on) me.visited[k] = { name: s.name, local: s.local, kind: s.kind, cuisine: s.cuisine || null, lat: +s.lat, lng: +s.lng, city: S.trip?.city || "", at: Date.now() };
  else delete me.visited[k];
  saveMe();
  const t = S.trip;
  if (t && t.source !== "sample") {
    t.fam = t.fam || { visited: {}, notes: {} };
    const who = me.name || "אני";
    const set = new Set(t.fam.visited[k] || []);
    on ? set.add(who) : set.delete(who);
    t.fam.visited[k] = [...set];
    saveTrip(t);
  }
}
/* when the traveler asks for their location, places on the route they are standing at are marked as visited */
function autoVisited() {
  const t = S.trip;
  if (!t || !S.me || km(S.me, t) > 50) return;
  const here = t.days.flatMap(d => d.stops).filter(s => !s.isHotel && !isVisited(s) && km(S.me, s) < 0.08);
  here.forEach(s => markVisited(s, true));
  if (here.length) toast(`סימנו שאתם ב${here[0].name}. נזכור את זה לטיולים הבאים.`);
}
function visitedRow(s) {
  const who = (S.trip.fam?.visited?.[placeKey(s)] || []).filter(n => !(isVisited(s) && n === (me.name || "אני")));
  return `<div class="visitrow"><button type="button" class="btn small ${isVisited(s) ? "" : "soft"}" id="visitBtn" aria-pressed="${isVisited(s)}">${ic("check")}${isVisited(s) ? "הייתי כאן" : "סימון: הייתי כאן"}</button>${who.length ? `<span class="pline">היו כאן גם: ${esc(who.join(", "))}</span>` : ""}</div>`;
}
function bindVisited(s) { $("visitBtn") && ($("visitBtn").onclick = () => { markVisited(s, !isVisited(s)); rerenderKeepScroll(); }); }

/* ================= family mode: share the trip, everyone adds notes and marks, send it back ================= */
function notesCard(s) {
  const notes = S.trip.fam?.notes?.[placeKey(s)] || [];
  return `<div class="card famnotes"><h2>${ic("speech")} הערות המשפחה</h2>
    ${!me.name ? `<p class="lead">כדי שיידעו מי כתב, כתבו את השם שלכם בכרטיס "מצב משפחתי" במסך המסלול.</p>` : ""}
    ${notes.length ? notes.map(n => `<div class="note"><b>${esc(n.by || "מישהו")}</b><span>${esc(n.text)}</span></div>`).join("") : `<p class="lead">הערה שתכתבו כאן תגיע לכל מי שתשלחו לו את הטיול.</p>`}
    <form id="noteForm" class="keyrow"><input id="noteIn" class="select" maxlength="200" placeholder="למשל: היה מעולה, להזמין שולחן ליד החלון" aria-label="הערה"><button class="btn small" type="submit">הוספה</button></form></div>`;
}
function bindNotes(s) {
  const f = $("noteForm");
  if (!f) return;
  f.onsubmit = e => {
    e.preventDefault();
    const text = $("noteIn").value.trim();
    if (!text) return;
    const t = S.trip;
    t.fam = t.fam || { visited: {}, notes: {} };
    const k = placeKey(s);
    (t.fam.notes[k] = t.fam.notes[k] || []).push({ by: me.name || "אני", text, at: Date.now() });
    saveTrip(t); rerenderKeepScroll(); toast("ההערה נשמרה. שלחו את הטיול כדי שכולם יראו.");
  };
}
function familyCard(t) {
  const notes = Object.values(t.fam?.notes || {}).reduce((a, l) => a + l.length, 0);
  const people = [...new Set(Object.values(t.fam?.visited || {}).flat().concat(Object.values(t.fam?.notes || {}).flat().map(n => n.by)))].filter(Boolean);
  return `<div class="card famcard"><h2>${ic("users")} מצב משפחתי</h2>
    <p>שולחים את הטיול למשפחה או לחברים. כל אחד פותח את הקישור, מסמן איפה היה ומוסיף הערות, ושולח בחזרה. ההערות והסימונים מתאחדים.</p>
    ${me.name ? `<div class="pline">שמך בהערות: <b>${esc(me.name)}</b> · <button type="button" class="linkbtn" id="famRename">שינוי</button></div>`
      : `<form class="keyrow" id="famNameForm"><input id="famName" class="select" maxlength="30" placeholder="איך קוראים לך? (יופיע ליד ההערות)" aria-label="השם שלך"><button type="submit" class="btn small">שמירה</button></form>`}
    ${notes || people.length ? `<div class="pline">${notes} הערות${people.length ? ` · משתתפים: ${esc(people.join(", "))}` : ""}</div>` : ""}
    <div class="chiprow"><button type="button" class="chipbtn" id="famWa">${ic("speech")}שליחה בוואטסאפ</button><button type="button" class="chipbtn" id="famShare">${ic("share")}שיתוף</button><button type="button" class="chipbtn" id="famCopy">${ic("save")}העתקת קישור</button></div>
    <div class="disclaim">${ic("shield")}<span>הטיול נשמר בתוך הקישור עצמו ולא בשרת. מי שמקבל את הקישור רואה את המסלול וההערות.</span></div></div>`;
}
function bindFamily() {
  const t = S.trip;
  $("famNameForm") && ($("famNameForm").onsubmit = e => {
    e.preventDefault(); const v = $("famName").value.trim(); if (!v) return;
    const old = me.name || "אני";
    me.name = v; saveMe();
    // notes and marks made before the name was set now carry it
    for (const tr of [t, ...savedTrips().filter(x => x.id !== t.id)]) {
      if (!tr.fam) continue;
      Object.values(tr.fam.notes || {}).forEach(l => l.forEach(n => { if (n.by === old || n.by === "אני") n.by = v; }));
      Object.keys(tr.fam.visited || {}).forEach(k => { tr.fam.visited[k] = [...new Set(tr.fam.visited[k].map(x => x === old || x === "אני" ? v : x))]; });
      saveTrip(tr);
    }
    rerenderKeepScroll();
  });
  $("famRename") && ($("famRename").onclick = () => { me.name = ""; saveMe(); rerenderKeepScroll(); });
  const link = async () => { try { return await shareLink(t); } catch { toast("לא הצלחנו ליצור קישור"); return null; } };
  const msg = u => `${me.name ? me.name + " שיתף/ה" : "שיתפו"} איתך טיול ל${t.city} במסע. פותחים, מסמנים איפה הייתם ומוסיפים הערות: ${u}`;
  $("famWa") && ($("famWa").onclick = async () => { const u = await link(); if (u) window.open(`https://wa.me/?text=${encodeURIComponent(msg(u))}`, "_blank", "noopener"); });
  $("famShare") && ($("famShare").onclick = async () => {
    const u = await link(); if (!u) return;
    if (navigator.share) { try { await navigator.share({ title: `טיול ל${t.city}`, text: msg(""), url: u }); } catch {} }
    else { try { await navigator.clipboard.writeText(u); toast("הקישור הועתק"); } catch { toast("לא הצלחנו להעתיק"); } }
  });
  $("famCopy") && ($("famCopy").onclick = async () => { const u = await link(); if (!u) return; try { await navigator.clipboard.writeText(u); toast("הקישור הועתק. אפשר להדביק בכל אפליקציה."); } catch { toast("לא הצלחנו להעתיק"); } });
}
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = s => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
async function zip(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof CompressionStream === "undefined") return "u" + b64(bytes);
  const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  return "z" + b64(out);
}
async function unzip(s) {
  const u = unb64(s.slice(1));
  if (s[0] === "u") return new TextDecoder().decode(u);
  return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
}
const SHARE_KEYS = ["name", "local", "cat", "kind", "kindHe", "meal", "mealHe", "lat", "lng", "time", "duration", "_min", "osm", "wikidata", "cuisine", "priceClass", "price", "fee", "mich", "wheel", "website", "phone", "address", "hours", "must", "signals", "cost", "isHotel", "q", "_wikiTag", "_he", "_en", "shops", "whyLang", "voyage"];
async function shareLink(t) {
  t.id = t.id || `t${Date.now()}`;
  const slim = s => { const o = {}; SHARE_KEYS.forEach(k => { if (s[k] != null && s[k] !== "" && !(Array.isArray(s[k]) && !s[k].length)) o[k] = s[k]; }); o.why = String(s.why || "").slice(0, 300); if (s.booking) o.booking = { needed: s.booking.needed, steps: s.booking.steps, query: s.booking.query, url: s.booking.url || null }; return o; };
  const data = { v: 1, id: t.id, from: me.name || "", city: t.city, slug: t.slug, cityLocal: t.cityLocal, cityEn: t.cityEn, country: t.country, cc: t.cc, tz: t.tz, lat: t.lat, lng: t.lng,
    opts: t.opts, hotel: t.hotel, summary: t.summary, days: t.days.map(d => ({ label: d.label, theme: d.theme, stops: d.stops.map(slim) })), fam: t.fam || null };
  return `${location.origin}${location.pathname}#t=${await zip(JSON.stringify(data))}`;
}
function mergeFam(a, b) {
  const out = { visited: { ...(a?.visited || {}) }, notes: { ...(a?.notes || {}) } };
  for (const [k, list] of Object.entries(b?.visited || {})) out.visited[k] = [...new Set([...(out.visited[k] || []), ...list])];
  let added = 0;
  for (const [k, list] of Object.entries(b?.notes || {})) {
    const cur = out.notes[k] = [...(out.notes[k] || [])];
    for (const n of list) if (!cur.some(x => x.by === n.by && x.text === n.text)) { cur.push(n); added++; }
    cur.sort((x, y) => (x.at || 0) - (y.at || 0));
  }
  return { fam: out, added };
}
async function importShared() {
  const m = location.hash.match(/^#t=([\w-]+)$/);
  if (!m) return false;
  history.replaceState(null, "", location.pathname + location.search);
  let d;
  try { d = JSON.parse(await unzip(m[1])); } catch { toast("הקישור לא תקין או חתוך. בקשו שישלחו אותו שוב."); return false; }
  const mine = savedTrips().find(x => x.id === d.id);
  if (mine) {
    const r = mergeFam(mine.fam, d.fam);
    mine.fam = r.fam;
    saveTrip(mine); openTrip(mine);
    toast(r.added ? `${r.added === 1 ? "נוספה הערה חדשה" : `נוספו ${r.added} הערות חדשות`}${d.from ? ` מ${d.from}` : ""}` : "הטיול עודכן");
    return true;
  }
  const t = { ...d, source: "shared", pending: true, createdAt: Date.now(), places: [], voyageNoGeo: [], discover: { gems: [], experiences: [], free: [], daytrips: [], dishes: [], phrases: PHRASES[MASA_DATA.COUNTRY_LANG?.[d.cc] || "en"] || PHRASES.en, etiquette: ETIQUETTE_GENERIC },
    days: d.days.map(x => ({ ...x, route: null, legs: null, stops: x.stops.map(s => ({ history: "", histLang: "he", fact: "", busy: null, best: "", tip: "", nearby: [], image: null, booking: { needed: false, steps: [] }, why: "", ...s })) })) };
  delete t.v; delete t.from;
  saveTrip(t); openTrip(t);
  toast(`${d.from ? d.from + " שיתף/ה" : "קיבלתם"} טיול ל${d.city}`);
  // bring back the lists of restaurants, hotels and ideas for this city
  planner.build({ ...t.opts, query: t.opts?.query || t.city, hotel: t.hotel || null }, () => {}, null).then(full => {
    t.places = full.places; t.voyageNoGeo = full.voyageNoGeo; t.discover = { ...full.discover, phrases: t.discover.phrases };
    saveTrip(t); if (S.trip === t) refreshSoon();
  }).catch(() => {});
  return true;
}

/* ---------- boot ---------- */
applyA11y();
if (me.form) S.form = { ...S.form, ...me.form };
renderPanel();
renderMap();
importShared();
addEventListener("hashchange", () => importShared());
})();
