/* מסע · the bookings screen and the trip kit (flights, hotel, insurance, calendar).
   Loaded when the screen is first opened (see LAZY in app.js); sw.js keeps it for offline. */
(function () {
"use strict";
function install(u) {
const { S, SCREENS, $, esc, ic, go, rerenderKeepScroll, toast, store, ai, CATS, HOME_SKIP, addDays, airbnbAreaUrl, aviaUrl, bindChecks, bindTripTop, bookingAreaUrl, bookingUrl, catOf, cityName, ckey, cv, domestic, flightsUrl, flyCenter, fmtDay, gSearch, googleHotelsUrl, hasXY, hotelsComUrl, isoDate, km, openList, openTripStep, safeUrl, siteName, tr, track, tripCenter, tripDates, tripTop } = u;
/* ---------- bookings ---------- */
/* the flights and where-to-sleep screens, always one tap away at the top of the bookings */
const stepRow = () => S.trip.source === "sample" ? "" : `<div class="linkrow steprow">${domestic(S.trip) ? "" : `<button type="button" class="chipbtn" id="bkFlights">${ic("plane")}טיסות</button>`}<button type="button" class="chipbtn" id="bkStay">${ic("bed")}איפה לישון</button></div>`;
const allBook = () => S.trip.days.flatMap(d => d.stops.map(s => ({ s, day: d.label }))).filter(x => x.s.booking?.needed);
function ring(p, col) { const r = 15, c = 2 * Math.PI * r; return `<svg class="ring" viewBox="0 0 38 38"><circle cx="19" cy="19" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="5"/><circle cx="19" cy="19" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 19 19)"/><text x="19" y="23" text-anchor="middle" font-size="10" font-family="IBM Plex Mono,monospace" fill="var(--ink)">${Math.round(p * 100)}%</text></svg>`; }
/* ================= the trip kit: everything a trip needs, in the order to close it, each one tap away and already
   filled in with the city, the dates and the number of travelers. We only send people to the sites; we never sell. ================= */
const KIT_KEY = "masa-kit";
const kitDone = () => { const all = store.get(KIT_KEY, {}); return all[S.trip?.id] || {}; };
function kitToggle(k) { const all = store.get(KIT_KEY, {}), id = S.trip.id, m = all[id] || {}; m[k] = !m[k]; all[id] = m; const ids = Object.keys(all); if (ids.length > 40) delete all[ids[0]]; store.set(KIT_KEY, all); }
const enMonth = d => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
const yymmdd = d => isoDate(d).slice(2).replace(/-/g, "");
function kitItems(t = S.trip) {
  const { start, end, people } = tripDates(t), city = cityName(), slug = t.slug || Masa.cities.findCity(t.city)?.slug;
  const ap = slug && tr() ? u.TR.airport(slug, { family: !!t.opts?.notes?.match(/ילד/), mobility: t.opts?.mobility }) : null;
  const iata = ap?.[0]?.code || "";
  const all = t.days.flatMap((d, di) => d.stops.map(s => ({ s, di })));
  const tickets = all.filter(x => x.s.booking?.needed);
  const dinners = all.filter(x => x.s.meal === "dinner");
  const c = tripCenter(t), near = all.filter(x => !x.s.isHotel && !x.s.meal && hasXY(x.s)).sort((a, b) => km(a.s, c) - km(b.s, c))[0]?.s;
  const car = t.opts?.move === "car";
  const easy = ap?.[0]?.list.find(o => o.easy);
  const I = (k, icn, title, when, why, links, extra = {}) => ({ k, icn, title, when, why, links, ...extra });
  return [
    I("flights", "fwd", "טיסות", 60, `טיסה מתל אביב ל${t.city}${iata ? ` (${iata})` : ""}, ${fmtDay(start)}–${fmtDay(end)}, ${people} נוסעים. כדאי להשוות בשני אתרים: המחיר לאותה טיסה משתנה בין האתרים.`,
      [...(iata ? [["Aviasales", aviaUrl(iata, start, end, people)], ["Kiwi.com", `https://www.kiwi.com/en/search/results/tel-aviv-israel/${iata.toLowerCase()}/${isoDate(start)}/${isoDate(end)}`]] : []), ["Google Flights", flightsUrl()], ...(iata ? [["Skyscanner", `https://www.skyscanner.co.il/transport/flights/tlv/${iata.toLowerCase()}/${yymmdd(start)}/${yymmdd(end)}/?adultsv2=${people}`], ["Kayak", `https://www.kayak.com/flights/TLV-${iata}/${isoDate(start)}/${isoDate(end)}/${people}adults`]] : [])]),
    I("hotel", "bed", "לינה", 60, t.hotel ? `כבר בחרתם: ${t.hotel.name}. אם עוד לא הזמנתם, אפשר לבדוק את המחיר שלו בכמה אתרים.` : `הכי נוח לישון קרוב לרוב התחנות שלכם${near ? `, באזור של ${near.name}` : ""}. החיפוש כבר מסונן לאזור הזה ולתאריכים.`,
      t.hotel ? [["Booking", bookingUrl(t.hotel)], ["Hotels.com", hotelsComUrl(t.hotel)], ["Google", googleHotelsUrl(t.hotel)]] : [["Booking באזור", bookingAreaUrl()], ["Airbnb באזור", airbnbAreaUrl()]], { go: "hotels" }),
    I("insurance", "shield", "ביטוח נסיעות", 10, "בדקו קודם מה כבר כלול בכרטיס האשראי שלכם, ואז השוו. ברוב הפוליסות הישראליות קונים לפני היציאה מהארץ. שימו לב לכיסוי למחלה קיימת, לכבודה ולספורט.",
      [["PassportCard", "https://www.passportcard.co.il/"], ["הראל", "https://www.harel-group.co.il/"], ["מגדל", "https://www.migdal.co.il/"], ["הפניקס", "https://www.fnx.co.il/"], ["כלל", "https://www.clalbit.co.il/"]]),
    ...(tickets.length ? [I("tickets", "ticket", `כרטיסים מראש (${tickets.length})`, 30, `${tickets.slice(0, 3).map(x => x.s.name).join(", ")}${tickets.length > 3 ? " ועוד" : ""}. לרובם נפתחת מכירה כמה שבועות מראש, ובעונה הכרטיסים נגמרים.`, [], { below: true })] : []),
    I("transfer", "bus", "מהשדה לעיר", 7, easy ? `הכי נוח מ${ap[0].he}: ${easy.n}, ${easy.min} דקות, ${easy.p}. רוצים שיחכו לכם עם שלט? אפשר להזמין הסעה מראש.` : "אפשר להזמין הסעה פרטית מראש, או לבדוק רכבת ואוטובוס מהשדה.",
      [["Welcome Pickups", "https://www.welcomepickups.com/"], ["Kiwitaxi", "https://kiwitaxi.com/"]], { go: "move" }),
    I("esim", "sim", "אינטרנט בחו״ל (eSIM)", 5, "חבילת גלישה דיגיטלית, בדרך כלל הרבה יותר זולה מחבילת חו״ל של החברה הסלולרית. קונים מהארץ ומפעילים כשנוחתים.",
      [["Airalo", "https://www.airalo.com/"], ["Saily", "https://saily.com/"], ["Yesim", "https://yesim.app/"]], { go: "info" }),
    ...(car ? [I("car", "car", "השכרת רכב", 30, `${fmtDay(start)}–${fmtDay(end)}${iata ? `, איסוף מ-${iata}` : ""}. השוו ביטוח השתתפות עצמית, ובדקו אם צריך רישיון נהיגה בינלאומי.`,
      [["Localrent", "https://localrent.com/"], ["Discover Cars", "https://www.discovercars.com/"]])] : []),
    I("tours", "users", "סיורים וטיולי יום", 14, `סיור מודרך בעברית או באנגלית, סיור הליכה חינמי (משלמים טיפ בסוף), וטיולי יום מ${t.city}.`,
      [["Klook", `https://www.klook.com/en-US/search/result/?query=${encodeURIComponent(city)}`], ["Tiqets", `https://www.tiqets.com/en/search?q=${encodeURIComponent(city)}`], ["Viator", `https://www.viator.com/searchResults/all?text=${encodeURIComponent(city)}`], ["סיור חינמי", gSearch(`free walking tour ${city}`)], ["סיורים בעברית", gSearch(`סיור מודרך בעברית ${t.city}`)]]),
    ...(dinners.length ? [I("tables", "food", "שולחן לארוחות ערב", 7, `${dinners.slice(0, 3).map(x => x.s.name).join(", ")}. בסופי שבוע כדאי לשריין שולחן כמה ימים מראש.`,
      dinners.slice(0, 3).map(x => [x.s.name, safeUrl(x.s.website) || `https://www.thefork.com/search?queryText=${encodeURIComponent(`${x.s.local || x.s.name} ${city}`)}`]))] : []),
    I("events", "sparkle", "מה קורה בעיר בתאריכים שלכם", 30, "הופעות, משחקים, פסטיבלים ושווקים מיוחדים. שווה לבדוק לפני שסוגרים את המסלול.",
      [["אירועים", gSearch(`events in ${city} ${enMonth(start)}`)], ["הופעות", gSearch(`concerts ${city} ${enMonth(start)}`)]], { fresh: true }),
    I("entry", "info", "דרכון וכניסה למדינה", 30, `בדקו שהדרכון בתוקף עוד חצי שנה לפחות אחרי החזרה, ומה צריך כדי להיכנס ל${t.country || t.city} (ויזה או אישור כניסה מקוון).`,
      [["דרישות כניסה", gSearch(`דרישות כניסה ${t.country || t.city} לישראלים`)], ["אזהרות מסע", gSearch(`אזהרת מסע ${t.country || t.city} המטה לביטחון לאומי`)]])
  ].filter(x => !(domestic(t) && HOME_SKIP.has(x.k)));
}
function kitView(t = S.trip) {
  const done = kitDone(), items = kitItems(t), { start } = tripDates(t);
  const left = Math.ceil((start - new Date()) / 864e5);
  const closed = items.filter(x => done[x.k]).length;
  const order = [...items].sort((a, b) => (!!done[a.k] - !!done[b.k]) || (a.when < b.when ? 1 : -1));
  const whenTxt = x => left <= x.when ? `<span class="tag book">כדאי לסגור עכשיו</span>` : `<span class="tag free">עד ${x.when === 60 ? "חודשיים" : x.when === 30 ? "חודש" : x.when + " ימים"} לפני</span>`;
  return `<div><div class="eyebrow">כל מה שצריך לטיול</div><h1 style="margin-top:4px">${closed} מתוך ${items.length} סגורים</h1></div>
    <div class="progress"><i style="width:${closed / items.length * 100}%"></i></div>
    <p class="lead">${left > 0 ? `עוד ${left} ימים לטיול. ` : ""}כל קישור כבר כולל את העיר, התאריכים ומספר הנוסעים. מסמנים מה כבר סגרתם.</p>
    <button type="button" class="btn soft block" id="toCal">${ic("clock")}הוספה ליומן: כל יום בטיול, ותזכורת מתי לסגור כל דבר</button>
    ${order.map(x => `<div class="kit${done[x.k] ? " done" : ""}"><div class="kithead"><span class="ic">${ic(x.icn)}</span><b>${esc(x.title)}</b>${done[x.k] ? `<span class="tag free">סגור</span>` : whenTxt(x)}</div>
      ${done[x.k] ? "" : `<p>${esc(x.why)}</p>${x.links.length ? `<div class="chiprow">${x.links.map(([l, u]) => `<a class="chipbtn" href="${esc(u)}" target="_blank" rel="noopener">${ic("ext")}${esc(l)}</a>`).join("")}</div>` : ""}`}
      ${!done[x.k] && x.fresh && ai.hasSearch() ? freshEventsHtml(t) : ""}
      <div class="kitfoot">${!done[x.k] && x.go ? `<button type="button" class="btn small soft" data-kitgo="${x.go}">${x.go === "hotels" ? "המלונות שלנו" : x.go === "move" ? "כל הדרכים מהשדה" : "פרטים"}</button>` : ""}${!done[x.k] && x.below ? `<button type="button" class="btn small soft" data-kitscroll>לרשימת הכרטיסים</button>` : ""}<label class="switchrow"><input type="checkbox" data-kit="${x.k}" ${done[x.k] ? "checked" : ""}><span>${done[x.k] ? "סגרתי" : "סימון שסגרתי"}</span></label></div></div>`).join("")}
    ${partnerNote()}`;
}
/* events found by a live web search (Tavily): kept in memory for this visit only, never saved */
const freshMem = new Map();
function freshEventsHtml(t) {
  const f = freshMem.get(t.id);
  if (!f) return `<button type="button" class="btn small" id="freshEvents">${ic("search")}חיפוש עכשיו: מה מתוכנן בעיר בתאריכים שלכם</button>`;
  if (f === "loading") return `<div class="skeleton" style="height:60px"></div>`;
  if (f.err) return `<p class="muted">${esc(f.err)}</p>`;
  if (!f.list.length) return `<p class="muted">החיפוש לא מצא אירועים מיוחדים. אפשר לנסות בקישורים למטה.</p>`;
  return `<ul class="freshlist">${f.list.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.title)}</b></a><small>${esc(siteName(x.url))}</small>${x.snippet ? `<p dir="auto">${esc(x.snippet)}</p>` : ""}</li>`).join("")}</ul><small class="muted">תוצאות חיפוש מהרשת (Tavily). בדקו תאריכים ומחירים באתר של האירוע.</small>`;
}
async function loadFreshEvents() {
  const t = S.trip, { start } = tripDates(t);
  freshMem.set(t.id, "loading"); rerenderKeepScroll();
  try {
    const list = await ai.events(t.cityEn || t.cityLocal || t.city, enMonth(start));
    freshMem.set(t.id, list ? { list } : { err: "החיפוש לא זמין כרגע.", list: [] });
  } catch (e) { freshMem.set(t.id, { err: e.code === "shared_quota" ? "הגענו למכסת החיפושים להיום. נסו שוב מחר." : "החיפוש לא הצליח. נסו שוב.", list: [] }); }
  if (S.screen === "book") rerenderKeepScroll();
}
/* the trip in the phone's calendar: every stop at its time, and a reminder for each thing still to close before the
   trip, on the day it is best closed (an .ics file that Google, Apple and Outlook calendars open) */
function tripIcs(t) {
  const { start } = tripDates(t), tz = t.tz || "", now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const escI = x => String(x || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = line => { const out = []; let cur = ""; for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = " " + ch; } else cur += ch; } out.push(cur); return out.join("\r\n"); };
  const stamp = `${ymd(now)}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Masa//Trip//HE", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escI("טיול ל" + t.city)}`];
  let n = 0;
  t.days.forEach((d, di) => {
    const day = addDays(start, di);
    d.stops.forEach(s => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(s.time || ""); if (!m) return;
      const mins = Math.max(15, Math.min(240, +s._min || 60));
      const a = new Date(day); a.setHours(+m[1], +m[2], 0, 0); const b = new Date(a.getTime() + mins * 60000);
      const dt = x => `${ymd(x)}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
      L.push("BEGIN:VEVENT", `UID:masa-${t.id}-${di}-${n++}@masa`, `DTSTAMP:${stamp}`,
        tz ? `DTSTART;TZID=${tz}:${dt(a)}` : `DTSTART:${dt(a)}`, tz ? `DTEND;TZID=${tz}:${dt(b)}` : `DTEND:${dt(b)}`,
        `SUMMARY:${escI((s.mealHe ? s.mealHe + ": " : "") + s.name)}`,
        ...(hasXY(s) ? [`LOCATION:${escI(s.address || s.local || s.name)}`, `GEO:${(+s.lat).toFixed(5)};${(+s.lng).toFixed(5)}`] : []),
        `DESCRIPTION:${escI(`${d.label || ""}. ${String(s.whyHe || s.why || "").slice(0, 200)}`)}`, "END:VEVENT");
    });
  });
  // reminders for what is still open in the trip kit
  const done = kitDone();
  for (const x of kitItems(t)) {
    if (done[x.k]) continue;
    let when = addDays(start, -x.when); if (when < now) when = addDays(now, 1);
    if (when >= start) continue;
    L.push("BEGIN:VEVENT", `UID:masa-${t.id}-kit-${x.k}@masa`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(when)}`, `DTEND;VALUE=DATE:${ymd(addDays(when, 1))}`,
      `SUMMARY:${escI(`לסגור לטיול ל${t.city}: ${x.title}`)}`, `DESCRIPTION:${escI(x.why)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escI(x.title)}`, "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
function downloadIcs(t) {
  const blob = new Blob([tripIcs(t)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `masa-${(t.cityEn || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("הקובץ ירד. פותחים אותו, והטיול נכנס ליומן");
}
const partnerNote = () => window.MASA_PARTNERS ? `<div class="disclaim">${ic("info")}<span>חלק מהקישורים הם של שותפים: אם תזמינו דרכם, ייתכן שמסע יקבל עמלה קטנה, בלי שום תוספת למחיר שלכם. ככה האפליקציה נשארת חינמית.</span></div>` : "";
SCREENS.book = {
  view() {
    const list = allBook();
    if (!list.length) return `<div class="screen">${tripTop(S.trip, "book")}${stepRow()}${kitView()}<div class="disclaim">${ic("shield")}<span>מסע לא גובה תשלום ולא שומר פרטי אשראי. ההזמנה עצמה נעשית תמיד באתר של המקום.</span></div></div>`;
    const stat = list.map(({ s }) => { const n = s.booking.steps.length, d = s.booking.steps.filter((_, i) => u.checks[ckey(s, i)]).length; return { n, d }; });
    const complete = stat.filter(x => x.d === x.n).length;
    return `<div class="screen">${tripTop(S.trip, "book")}${stepRow()}${kitView()}
    <div id="bookList"><div class="eyebrow">כרטיסים מראש</div><h2 style="margin-top:4px">${complete} מתוך ${list.length} הזמנות הושלמו</h2></div>
    <div class="progress"><i style="width:${complete / list.length * 100}%"></i></div>
    <p class="lead">סמנו כל שלב כשסיימתם. ההתקדמות נשמרת בדפדפן הזה.</p>
    ${list.map(({ s, day }, bi) => { const st = stat[bi], open = S.openBook === s.name, c = CATS[catOf(s)], url = safeUrl(s.website || s.booking.url);
      return `<div class="bookcard" data-b="${bi}"><button type="button" class="bookhead" data-name="${esc(s.name)}" aria-expanded="${open}"><span class="ic" style="background:${cv(c.c)}">${ic(catOf(s))}</span>
        <span class="grow"><h3>${esc(s.name)}</h3><span class="meta"><span>${esc(day)}</span>${s.time ? `<span>${ic("clock")}${esc(s.time)}</span>` : ""}${s.cost ? `<span>${ic("coin")}${esc(s.cost)}</span>` : ""}</span></span>${ring(st.n ? st.d / st.n : 0, st.d === st.n ? cv("--teal") : cv("--coral"))}</button>
        ${open ? `<ul class="u.checks">${s.booking.steps.map((x, i) => `<li><label class="${u.checks[ckey(s, i)] ? "done" : ""}"><input type="checkbox" data-i="${i}" ${u.checks[ckey(s, i)] ? "checked" : ""}><span><span class="stepn">שלב ${i + 1}</span>${esc(x)}</span></label></li>`).join("")}</ul>
        ${s.best ? `<div class="besttime" style="margin:0 12px 10px">${ic("clock")}<span>שעה מומלצת לביקור: ${esc(s.best)}</span></div>` : ""}
        <div class="linkrow" style="padding:0 12px 12px">${url ? `<a class="lnk primary wide" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${ic("shield")}לאתר הרשמי ${ic("ext")}</a>` : `<a class="lnk primary wide" href="${gSearch(s.booking.query || s.local)}" target="_blank" rel="noopener">${ic("search")}למציאת האתר הרשמי ${ic("ext")}</a>`}</div>` : ""}</div>`; }).join("")}
    <div class="disclaim">${ic("shield")}<span>מסע לא גובה תשלום ולא שומר פרטי אשראי. ההזמנה עצמה נעשית תמיד באתר של המקום.</span></div>
  </div>`;
  },
  bind() {
    bindTripTop();
    $("bkFlights") && ($("bkFlights").onclick = () => openTripStep("flights"));
    $("bkStay") && ($("bkStay").onclick = () => openTripStep("stay"));
    $("freshEvents") && ($("freshEvents").onclick = loadFreshEvents);
    $("toCal") && ($("toCal").onclick = () => downloadIcs(S.trip));
    track("kit_open", S.trip?.slug || S.trip?.cityEn, null, "kit:" + S.trip?.id);
    document.querySelectorAll("[data-kit]").forEach(b => b.onchange = () => { kitToggle(b.dataset.kit); rerenderKeepScroll(); });
    document.querySelectorAll("[data-kitgo]").forEach(b => b.onclick = () => { S.prev = "book"; b.dataset.kitgo === "hotels" ? openList("hotel") : go(b.dataset.kitgo); });
    document.querySelectorAll("[data-kitscroll]").forEach(b => b.onclick = () => $("bookList")?.scrollIntoView({ behavior: u.reduced ? "auto" : "smooth" }));
    document.querySelectorAll(".bookhead[data-name]").forEach(b => b.onclick = () => {
      S.openBook = S.openBook === b.dataset.name ? null : b.dataset.name;
      rerenderKeepScroll();
      const x = allBook().find(x => x.s.name === S.openBook);
      if (x) flyCenter(x.s, 16);
    });
    bindChecks(inp => allBook()[+inp.closest("[data-b]").dataset.b].s);
  }
};
}
window.Masa = window.Masa || {};
window.Masa.book = { install };
})();
