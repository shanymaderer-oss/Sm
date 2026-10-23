/* מסע · app: Leaflet map + app screens */
(() => {
"use strict";
const { P, CATS, INTERESTS, DAYC, DESTS, SAMPLE, PHRASES, ETIQUETTE_GENERIC } = window.MASA_DATA;
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

/* ---------- state ---------- */
const S = {
  screen: "home", prev: "home", dest: null,
  form: { days: 3, interests: ["food", "view"], budget: "בינוני", pace: "מאוזן", diet: "הכול", notes: "" },
  list: { chip: "food", sort: "best", open: false, cuisine: null, price: null, diet: null, q: "", page: 1 }, poi: null,
  trip: null, day: 0, stop: 0, openBook: null, chat: [], chatLog: [], busy: false, me: null
};
let checks = store.get("masa-checks", {});
const ckey = (s, i) => `${S.trip?.city}|${s.name}|${i}`;
const TRIP_SCREENS = ["plan", "place", "book", "guide", "discover", "list", "poi"];

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
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    <div class="section-label">תחומי עניין</div>
    <div class="tiles">${INTERESTS.map(k => `<button type="button" class="tile" data-k="${k}" aria-pressed="${f.interests.includes(k)}"><span class="ic" style="background:${cv(CATS[k].c)}">${ic(k)}</span>${CATS[k].he}</button>`).join("")}</div>
    <div class="section-label">תקציב</div>
    <div class="seg" id="budget">${["חסכוני", "בינוני", "מפנק"].map(v => `<button type="button" aria-pressed="${f.budget === v}">${v}</button>`).join("")}</div>
    <div class="section-label">אוכל</div>
    <div class="seg" id="diet">${["הכול", "צמחוני", "כשר"].map(v => `<button type="button" aria-pressed="${f.diet === v}">${v}</button>`).join("")}</div>
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
    $("notes").oninput = e => f.notes = e.target.value;
    $("buildBtn").onclick = build;
  }
};

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
    const trip = await planner.build({ query: S.dest.q, ...S.form, onGeo }, step, buildCtl.signal);
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
function legInfo(d, i) {
  const a = d.stops[i - 1], b = d.stops[i];
  const leg = d.legs?.[i - 1];
  const kmv = leg ? leg.m / 1000 : km(a, b) * 1.25;
  const min = leg ? Math.round(leg.s / 60) : Math.round(kmv / 4.6 * 60);
  return { kmv, min, transit: min > 35 };
}
function totalWalk(t) { let w = 0; t.days.forEach(d => d.stops.forEach((s, i) => { if (i) w += legInfo(d, i).kmv; })); return w; }
SCREENS.plan = {
  view() {
    const t = S.trip, all = t.days.flatMap(d => d.stops);
    const d = t.days[S.day], col = cv(DAYC[S.day % 5]);
    const ideas = d.stops.flatMap(s => (s.nearby || []).map(n => ({ ...n, _near: s.name }))).filter(n => !d.stops.some(s => s.name === n.name)).slice(0, 3);
    const tag = t.source === "sample" ? "טיול לדוגמה" : t.ai ? "נבנה ממידע פתוח + מדריך חכם" : "נבנה ממידע פתוח";
    return `<div class="screen">
    <div class="triphero"><div class="eyebrow" style="color:#fff;opacity:.9">${tag} · ${esc(t.country || "")}</div>
      <h1>${esc(t.city)} · ${t.days.length} ${t.days.length === 1 ? "יום" : "ימים"}</h1><p>${esc(t.summary || "")}</p>${t.pending ? `<div class="pending"><i></i>מוסיפים סיפורים, תמונות ומסלולי הליכה…</div>` : ""}
      <div class="stats"><div><b>${all.length}</b><small>תחנות</small></div><div><b>${all.filter(s => s.booking?.needed).length}</b><small>דורשות הזמנה</small></div><div><b>${totalWalk(t).toFixed(1)}</b><small>ק״מ הליכה</small></div></div></div>
    <div class="daytabs" role="tablist">${t.days.map((x, i) => `<button type="button" role="tab" class="daytab" data-i="${i}" aria-selected="${i === S.day}" style="${i === S.day ? `background:${cv(DAYC[i % 5])}` : ""}"><span class="dot" style="background:${i === S.day ? "#fff" : cv(DAYC[i % 5])}"></span>${esc(x.label)}</button>`).join("")}</div>
    ${d.theme ? `<div class="daytheme">${esc(d.theme)}</div>` : ""}
    <div class="timeline">${d.stops.map((s, i) => {
      let leg = "";
      if (i) { const L2 = legInfo(d, i), p = d.stops[i - 1];
        leg = `<div class="leg">${ic(L2.transit ? "train" : "nav")} ${L2.kmv.toFixed(1)} ק״מ · ${L2.transit ? "עדיף תחבורה ציבורית" : `${L2.min} דק׳ הליכה`} · <a href="${gmDir(p, s, L2.transit ? "transit" : "walking")}" target="_blank" rel="noopener">ניווט</a></div>`; }
      return leg + `<button type="button" class="stop" data-i="${i}">${s.image ? `<span class="thumb" style="background-image:url('${esc(s.image)}')"><span class="n" style="color:${col}">${i + 1}</span></span>` : `<span class="ic" style="background:${cv(CATS[catOf(s)].c)}">${ic(catOf(s))}<span class="n" style="color:${col}">${i + 1}</span></span>`}
        <span style="min-width:0">${s.mealHe ? `<span class="mealtag">${esc(s.mealHe)}</span>` : ""}<span class="t">${esc(s.name)}</span>${placeLine(s) ? `<span class="pline">${placeLine(s)}</span>` : ""}<span class="meta">${s.time ? `<span>${ic("clock")}${esc(s.time)}</span>` : ""}${s.duration ? `<span>${ic("hourglass")}${esc(s.duration)}</span>` : ""}${s.busy ? `<span>${ic("users")}${peakWord(s)}</span>` : ""}</span></span>
        <span class="tag ${s._added ? "new" : s.booking?.needed ? "book" : "free"}">${s._added ? "הוספתם" : s.booking?.needed ? "דורש הזמנה" : "בלי הזמנה"}</span></button>`;
    }).join("")}</div>
    ${ideas.length ? `<div class="ideas"><h2>${ic("sparkle")} נשאר לכם זמן היום? רעיונות בדרך</h2>
      ${ideas.map(n => `<div class="idea"><span class="ic" style="background:${cv(CATS[catOf(n)].c)}">${ic(catOf(n))}</span><span><b>${esc(n.name)}</b><small>ליד ${esc(n._near)} · ${esc(n.why)}</small></span><button type="button" class="btn small soft" data-add="${esc(n.name)}">${ic("plus")}הוספה</button></div>`).join("")}</div>` : ""}
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
    ${(s.time || s.duration || s.cost) ? `<div class="facts"><div><small>${ic("clock")}שעה</small><b>${esc(s.time || "—")}</b></div><div><small>${ic("hourglass")}משך</small><b>${esc(s.duration || "—")}</b></div><div><small>${ic("coin")}עלות</small><b>${esc(s.cost || "—")}</b></div></div>` : ""}
    ${placeLine(s) ? `<div class="pline big">${placeLine(s)}</div>` : ""}
    ${(s.signals || []).length ? `<div class="sigs">${s.signals.map(x => `<span>${ic("check", 2.6)}${esc(x)}</span>`).join("")}</div>` : ""}
    ${s.whyLang === "en" ? `<div class="vquote"><p dir="ltr" lang="en">${esc(s.why)}</p><div class="source">המלצה מתוך <a href="https://en.wikivoyage.org/wiki/${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}" target="_blank" rel="noopener">Wikivoyage</a>, ברישיון CC BY-SA</div></div>` : `<p>${esc(s.why)}</p>`}
    ${contactRow(s)}
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
const CUISINE_HE = { italian: "איטלקי", pizza: "פיצה", french: "צרפתי", spanish: "ספרדי", tapas: "טאפאס", japanese: "יפני", sushi: "סושי", ramen: "ראמן",
  chinese: "סיני", thai: "תאילנדי", indian: "הודי", mexican: "מקסיקני", burger: "המבורגר", steak_house: "סטייקים", seafood: "פירות ים", fish: "דגים",
  vegetarian: "צמחוני", vegan: "טבעוני", greek: "יווני", turkish: "טורקי", kebab: "קבב", czech: "צ׳כי", portuguese: "פורטוגלי", regional: "מקומי",
  mediterranean: "ים תיכוני", american: "אמריקאי", asian: "אסייתי", korean: "קוריאני", vietnamese: "וייטנאמי", lebanese: "לבנוני", israeli: "ישראלי",
  middle_eastern: "מזרח תיכוני", coffee_shop: "קפה", ice_cream: "גלידה", cake: "עוגות", breakfast: "ארוחות בוקר", german: "גרמני", austrian: "אוסטרי",
  hungarian: "הונגרי", british: "בריטי", dutch: "הולנדי", roman: "רומאי", tuscan: "טוסקני", catalan: "קטלאני", basque: "באסקי", international: "בינלאומי",
  sandwich: "כריכים", bistro: "ביסטרו", wine_bar: "בר יין", brunch: "בראנץ׳", crepe: "קרפים", noodle: "נודלס", dumpling: "כיסונים", bagel: "בייגל",
  georgian: "גאורגי", polish: "פולני", russian: "רוסי", african: "אפריקאי", ethiopian: "אתיופי", peruvian: "פרואני", argentinian: "ארגנטינאי", brazilian: "ברזילאי",
  tea: "תה", pastry: "מאפים", bakery: "מאפייה", gelato: "ג׳לטו", local: "מקומי", fine_dining: "פיין דיינינג" };
const cuisineList = c => String(c || "").split(/[;,]/).map(x => x.trim().toLowerCase()).filter(Boolean);
const cuisineHe = c => cuisineList(c).slice(0, 3).map(x => CUISINE_HE[x] || x.replace(/_/g, " ")).join(" · ");
const CHIPS = [
  ["food", "מסעדות", ["restaurant"], "food"], ["cafe", "בתי קפה", ["cafe", "bakery"], "cafe"], ["dessert", "קינוחים", ["dessert"], "heart"],
  ["market", "שווקים", ["market", "deli"], "shopping"], ["mall", "קניונים וקניות", ["mall", "store", "shop"], "shopping"], ["bar", "ברים ולילה", ["bar", "club"], "night"],
  ["sights", "אטרקציות", ["attraction", "sight", "view", "church"], "history"], ["museum", "מוזיאונים", ["museum", "gallery"], "art"], ["park", "פארקים וטבע", ["park", "beach", "zoo", "themepark"], "nature"]
];
const CHIP_ICON = { restaurant: "food", cafe: "cafe", bakery: "cafe", dessert: "heart", market: "shopping", deli: "shopping", mall: "shopping", store: "shopping", shop: "shopping", bar: "night", club: "night", museum: "art", gallery: "art", park: "nature", beach: "nature", zoo: "family", themepark: "family", church: "religion", view: "view", sight: "history", attraction: "view" };
const PRICE = { budget: "זול", mid: "מחיר בינוני", splurge: "יוקרתי" };
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
  if (p.priceClass) bits.push(PRICE[p.priceClass]);
  const o = openState(p);
  if (o === true) bits.push(`<b class="open">פתוח עכשיו</b>`);
  if (o === false) bits.push(`<b class="closed">סגור עכשיו</b>`);
  return bits.map(b => b.startsWith("<b") ? b : esc(b)).join(" · ");
}
const reviewsUrl = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.local || p.name} ${p.address || ""} ${cityQ()}`.trim())}`;
function contactRow(p) {
  const items = [];
  items.push(`<a class="chipbtn" href="${reviewsUrl(p)}" target="_blank" rel="noopener">${ic("users")}ביקורות ותמונות בגוגל</a>`);
  if (p.website) items.push(`<a class="chipbtn" href="${esc(p.website)}" target="_blank" rel="noopener">${ic("ext")}אתר</a>`);
  if (p.phone) items.push(`<a class="chipbtn" href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${ic("speech")}<bdi dir="ltr">${esc(p.phone)}</bdi></a>`);
  return `<div class="chiprow">${items.join("")}</div>${p.address ? `<div class="hoursrow">${ic("pin")}<span><bdi dir="ltr">${esc(p.address)}</bdi></span></div>` : ""}`;
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
  S.list = { chip, sort: "best", open: false, cuisine: null, price: null, diet: null, q, page: 1 };
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
  const ref = S.me && km(S.me, S.trip) < 50 ? S.me : S.trip.days[S.day]?.stops?.[S.stop] || S.trip;
  items = items.map(p => ({ ...p, _d: km(ref, p) }));
  items.sort(L2.sort === "near" ? (a, b) => a._d - b._d : (a, b) => (b.q - b._d * 0.4) - (a.q - a._d * 0.4));
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
        <span class="t">${esc(p.name)}</span>
        <span class="pline">${[planner.KIND[p.kind]?.he, cuisineHe(p.cuisine), p.priceClass ? PRICE[p.priceClass] : ""].filter(Boolean).map(esc).join(" · ")}${o === true ? ` · <b class="open">פתוח עכשיו</b>` : o === false ? ` · <b class="closed">סגור</b>` : ""}</span>
        ${p.signals?.length ? `<span class="sigs small">${p.signals.slice(0, 3).map(x => `<span>${esc(x)}</span>`).join("")}</span>` : ""}
        ${p.vtext ? `<span class="vtext" dir="ltr" lang="en">${esc(p.vtext.slice(0, 140))}${p.vtext.length > 140 ? "…" : ""}</span>` : ""}
      </span>
      <span class="dist">${fmtDist(p._d)}</span>
    </button>
    <div class="pact">
      ${inTrip ? `<span class="tag new">במסלול</span>` : `<button type="button" class="btn small" data-addp="${i}">${ic("plus")}למסלול</button>`}
      <a class="btn small soft" href="${gmDir(S.me || S.trip.days[S.day]?.stops?.[S.stop] || S.trip, p)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("nav")}ניווט</a>
      <a class="btn small soft" href="${reviewsUrl(p)}" target="_blank" rel="noopener" style="text-decoration:none">${ic("users")}ביקורות</a>
    </div>
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
    <div class="filters">
      <button type="button" data-sort="best" aria-pressed="${L2.sort === "best"}">הכי מומלץ</button>
      <button type="button" data-sort="near" aria-pressed="${L2.sort === "near"}">${S.me ? "הכי קרוב אליי" : "הכי קרוב למסלול"}</button>
      ${now ? `<button type="button" id="fOpen" aria-pressed="${L2.open}">פתוח עכשיו</button>` : ""}
      ${hasPrice ? ["budget", "mid", "splurge"].map(k => `<button type="button" data-price="${k}" aria-pressed="${L2.price === k}">${PRICE[k]}</button>`).join("") : ""}
      ${showFood ? `<button type="button" data-diet="veg" aria-pressed="${L2.diet === "veg"}">צמחוני</button><button type="button" data-diet="kosher" aria-pressed="${L2.diet === "kosher"}">כשר</button>` : ""}
    </div>
    ${cuisines.length > 1 && showFood ? `<div class="filters scroll-x">${cuisines.map(([c, n]) => `<button type="button" data-cu="${esc(c)}" aria-pressed="${L2.cuisine === c}">${esc(CUISINE_HE[c] || c.replace(/_/g, " "))} <small>${n}</small></button>`).join("")}</div>` : ""}
    <div class="disclaim">${ic("info")}<span>הדירוג לפי סימני איכות פתוחים: המלצות Wikivoyage, כוכבי מישלן, מקום מוכר, מטבח מקומי ואתר פעיל. לדירוג כוכבים ולביקורות לחצו על "ביקורות".${now && !S.me ? ` "פתוח עכשיו" לפי השעה ב${esc(S.trip.city)}.` : ""}</span></div>
    <div class="plist">${shown.map(placeCard).join("") || `<p class="lead">${L2.q ? `לא מצאנו את "${esc(L2.q)}" ב${esc(S.trip.city)}.` : "לא נמצאו מקומות. נסו להוריד סינון."}</p>`}</div>
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
    document.querySelectorAll("[data-price]").forEach(b => b.onclick = () => { L2.price = L2.price === b.dataset.price ? null : b.dataset.price; refresh(true); });
    document.querySelectorAll("[data-diet]").forEach(b => b.onclick = () => { L2.diet = L2.diet === b.dataset.diet ? null : b.dataset.diet; refresh(true); });
    document.querySelectorAll("[data-cu]").forEach(b => b.onclick = () => { L2.cuisine = L2.cuisine === b.dataset.cu ? null : b.dataset.cu; refresh(true); });
    $("asDest") && ($("asDest").onclick = () => { S.dest = { q: L2.q, he: L2.q.split(",")[0].trim() }; go("goals"); });
    $("more") && ($("more").onclick = () => { L2.page++; rerenderKeepScroll(); renderMap(); });
    const items = listItems();
    document.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { S.poi = items[+b.dataset.open]; go("poi"); });
    document.querySelectorAll("[data-addp]").forEach(b => b.onclick = () => { addPlace(items[+b.dataset.addp]); rerenderKeepScroll(); });
  }
};
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
    <div class="pline big">${[cuisineHe(p.cuisine), p.priceClass ? PRICE[p.priceClass] : "", p.price || ""].filter(Boolean).map(esc).join(" · ")}${o === true ? ` · <b class="open">פתוח עכשיו</b>` : o === false ? ` · <b class="closed">סגור עכשיו</b>` : ""} · ${fmtDist(km(ref, p))}</div>
    ${p.signals?.length ? `<div class="sigs">${p.signals.map(x => `<span>${ic("check", 2.6)}${esc(x)}</span>`).join("")}</div>` : ""}
    ${p.vtext ? `<div class="vquote"><p dir="ltr" lang="en">${esc(p.vtext)}</p><div class="source">המלצה מתוך <a href="https://en.wikivoyage.org/wiki/${encodeURIComponent(S.trip.cityEn || S.trip.cityLocal)}" target="_blank" rel="noopener">Wikivoyage</a>, ברישיון CC BY-SA</div></div>` : ""}
    ${contactRow(p)}
    ${p.hours ? `<div class="hoursrow">${ic("clock")}<span>שעות פתיחה: <bdi dir="ltr" class="nowrap">${esc(p.hours)}</bdi></span></div>` : ""}
    <div class="card"><h2>${ic("plus")} הוספה למסלול</h2>
      <div class="keyrow"><select id="poiDay" class="select" style="flex:1">${dayOpts}</select><button type="button" class="btn" id="poiAdd">הוספה</button></div></div>
    <div class="linkrow">
      <a class="lnk primary" href="${gmDir(ref, p)}" target="_blank" rel="noopener">${ic("nav")}ניווט</a>
      <a class="lnk" href="${reviewsUrl(p)}" target="_blank" rel="noopener">${ic("pin")}בגוגל מפות</a>
    </div>
    <div class="disclaim">${ic("info")}<span>המידע מ-OpenStreetMap${p.vtext ? " ומ-Wikivoyage" : ""}. שעות ומחירים יכולים להשתנות.</span></div>
  </div>`;
  },
  bind() {
    $("backPoi").onclick = () => go("list", { noFly: true });
    $("poiAdd").onclick = () => { const di = +$("poiDay").value; addPlace(S.poi, di); toast(`${S.poi.name} נוסף ל${S.trip.days[di].label}`); };
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

/* ---------- boot ---------- */
renderPanel();
renderMap();
})();
