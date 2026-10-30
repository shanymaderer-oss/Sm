/* מסע · the start of a trip, before the route: the cheapest flights for the dates (and cheaper days around them), and
   where to sleep so most of what is worth seeing is a walk away. Loaded only when these screens open.
   Flight prices come from Travelpayouts / Aviasales through our guide server (the token stays there); without it, the
   same searches open ready-made on Aviasales, Kayak and Google Flights. Nothing here books or pays: every booking is on
   the booking site itself. */
window.Masa = window.Masa || {};
Masa.journey = (() => {
  /* the city's airport code for flight searches (a city code covers all its airports: ROM is Fiumicino and Ciampino) */
  const CITY_AIR = { rome: "ROM", paris: "PAR", london: "LON", barcelona: "BCN", prague: "PRG", amsterdam: "AMS", athens: "ATH", bangkok: "BKK",
    batumi: "BUS", belgrade: "BEG", berlin: "BER", bucharest: "BUH", budapest: "BUD", copenhagen: "CPH", dubai: "DXB", dublin: "DUB", edinburgh: "EDI",
    florence: "FLR", istanbul: "IST", krakow: "KRK", larnaca: "LCA", limassol: "LCA", lisbon: "LIS", madrid: "MAD", milan: "MIL", munich: "MUC",
    naples: "NAP", "new-york": "NYC", nice: "NCE", paphos: "PFO", porto: "OPO", seville: "SVQ", sofia: "SOF", tbilisi: "TBS", thessaloniki: "SKG",
    tokyo: "TYO", valencia: "VLC", venice: "VCE", vienna: "VIE", warsaw: "WAW" };
  const AIRLINE = { LY: "אל על", IZ: "ארקיע", "6H": "ישראייר", H4: "הייסקיי", W6: "וויז אייר", W4: "וויז אייר", W9: "וויז אייר", "5W": "וויז אייר",
    FR: "ריינאייר", RK: "ריינאייר", U2: "איזיג׳ט", EC: "איזיג׳ט", DS: "איזיג׳ט", VY: "ווולינג", AZ: "ITA", LH: "לופטהנזה", A3: "אגאיין", OA: "אולימפיק",
    TK: "טורקיש", PC: "פגסוס", BA: "בריטיש איירווייז", AF: "אייר פראנס", KL: "KLM", OS: "אוסטריאן", LX: "סוויס", LO: "LOT", OK: "צ׳כיה", RO: "טארום",
    FZ: "פליידובאי", EK: "אמירייטס", BT: "airBaltic", TP: "TAP", IB: "איבריה", UX: "אייר אירופה", SN: "בריסל", EW: "יורווינגס", A9: "ג׳ורג׳יאן",
    FB: "בולגריה אייר", JU: "אייר סרביה", SK: "SAS", D8: "נורוויג׳ן", DY: "נורוויג׳ן", CY: "סייפרוס אייר", TG: "תאי", NH: "ANA", JL: "JAL", EY: "אתיחאד", ET: "אתיופיאן" };
  const airFor = slug => CITY_AIR[slug] || null;
  const iso = d => d.toISOString().slice(0, 10);
  const add = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const ddmm = s => s.slice(8, 10) + s.slice(5, 7);
  const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  const dayName = s => DAYS[new Date(s + "T12:00:00Z").getUTCDay()];
  const short = s => `${+s.slice(8, 10)}.${+s.slice(5, 7)}`;
  const hhmm = t => (String(t || "").match(/T(\d\d:\d\d)/) || [])[1] || "";

  /* the flights: the exact dates, and the same length of trip on other days of the same months */
  async function flights(proxy, to, depart, back) {
    const ask = body => fetch(proxy.replace(/\/$/, "") + "/flights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => r.status === 503 ? { off: true } : r.ok ? r.json() : null).catch(() => null);
    const [exact, month] = await Promise.all([ask({ to, depart, back }), ask({ to, depart: depart.slice(0, 7), back: back.slice(0, 7) })]);
    if (exact?.off) return { off: true };
    if (!exact && !month) return null;
    const ok = x => x && x.price > 0 && /^\d{4}-\d\d-\d\d/.test(x.depart || "");
    const list = (exact?.flights || []).filter(ok).filter(x => x.depart.slice(0, 10) === depart);
    // other days: the same number of nights, up to a week before or after, cheaper than the best on their dates
    const nights = Math.round((new Date(back) - new Date(depart)) / 864e5), best = list[0]?.price || Infinity, seen = new Set([depart]);
    const around = (month?.flights || []).filter(ok).filter(x => x.back && Math.round((new Date(x.back.slice(0, 10)) - new Date(x.depart.slice(0, 10))) / 864e5) === nights)
      .filter(x => Math.abs(new Date(x.depart.slice(0, 10)) - new Date(depart)) <= 7 * 864e5 && x.price < best * 0.92)
      .sort((a, b) => a.price - b.price).filter(x => !seen.has(x.depart.slice(0, 10)) && seen.add(x.depart.slice(0, 10))).slice(0, 4);
    return { list: list.slice(0, 5), around };
  }
  /* the same search, ready, on the big sites (no prices needed from us) */
  function searchLinks(to, depart, back, people) {
    const n = Math.max(1, Math.min(9, people || 1));
    return [
      { name: "Aviasales", url: `https://www.aviasales.com/search/TLV${ddmm(depart)}${to}${ddmm(back)}${n}` },
      { name: "Kayak", url: `https://www.kayak.com/flights/TLV-${to}/${depart}/${back}/${n}adults?sort=price_a` },
      { name: "Google Flights", url: `https://www.google.com/travel/flights?hl=iw&q=${encodeURIComponent(`Flights from TLV to ${to} on ${depart} through ${back}`)}` }
    ];
  }

  /* ---------- where to sleep: the spot closest to most of what is worth seeing ---------- */
  const km = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  /* places: [{name, lat, lng, fame, cat}] of a ready city; areas: Hebrew names of neighborhoods [{name, lat, lng}].
     Returns up to two spots far enough apart to be a real choice, each named and with what is close to it. */
  function bases(places, areas, center, interests = [], cityHe = "") {
    const clean = n => String(n || "").replace(/\s*\([^)]*\)\s*$/, "").replace(cityHe ? new RegExp(`\\s+ב${cityHe}$`) : /$^/, "").trim();
    const seenName = new Set();
    const top = places.filter(p => p.fame > 0 && !["food", "sleep", "shopping"].includes(p.cat) && (p.cat !== "night" || interests.includes("night")))
      .map(p => ({ ...p, name: clean(p.name) })).sort((a, b) => b.fame - a.fame).filter(p => p.name && !seenName.has(p.name) && seenName.add(p.name)).slice(0, 40);
    if (top.length < 5) return center ? [{ name: "מרכז העיר", lat: center.lat, lng: center.lng, near: [], n: 0, center: true }] : [];
    const w = p => Math.sqrt(p.fame);
    const score = c => top.reduce((s, p) => s + w(p) * Math.exp(-km(c, p) / 0.9), 0);
    // a spot between places (each place and the middle of every two close ones), scored by what is a walk away
    const cands = [...top];
    for (let i = 0; i < Math.min(top.length, 20); i++) for (let j = i + 1; j < Math.min(top.length, 20); j++) if (km(top[i], top[j]) < 1.6) cands.push({ lat: (top[i].lat + top[j].lat) / 2, lng: (top[i].lng + top[j].lng) / 2 });
    const ranked = cands.map(c => ({ c, s: score(c) })).sort((a, b) => b.s - a.s);
    const picks = [ranked[0]];
    const second = ranked.find(x => km(x.c, ranked[0].c) >= 1.5 && x.s >= ranked[0].s * 0.6);
    if (second) picks.push(second);
    return picks.map(({ c }) => {
      const near = top.filter(p => km(c, p) <= 1.3).sort((a, b) => b.fame - a.fame);
      const area = areas.map(a => ({ a, d: km(c, a) })).sort((x, y) => x.d - y.d)[0];
      // named after the best-known place close by (the Imperial Palace, not a stone in its garden)
      const land = (near.filter(p => km(c, p) <= 0.6)[0] && { p: near.filter(p => km(c, p) <= 0.6)[0] }) || top.map(p => ({ p, d: km(c, p) })).sort((x, y) => x.d - y.d)[0];
      const name = area && area.d < 0.9 ? area.a.name : land ? `האזור של ${land.p.name}` : "מרכז העיר";
      return { name, lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), near: near.slice(0, 4).map(p => p.name), n: near.length };
    });
  }
  /* the same spot, ready, on the sites that rent rooms: the dates and how many already in */
  function stayLinks(b, city, checkin, checkout, people) {
    const n = Math.max(1, Math.min(9, people || 2)), where = b.center ? city : `${b.name.replace(/^האזור של /, "")}, ${city}`, d = 0.012;
    return [
      { name: "Booking", url: `https://www.booking.com/searchresults.he.html?ss=${encodeURIComponent(where)}&latitude=${b.lat}&longitude=${b.lng}&dest_type=latlong&radius=1.5&checkin=${checkin}&checkout=${checkout}&group_adults=${n}&no_rooms=1&order=distance_from_search` },
      { name: "Airbnb", url: `https://www.airbnb.com/s/homes?query=${encodeURIComponent(where)}&checkin=${checkin}&checkout=${checkout}&adults=${n}&search_by_map=true&ne_lat=${(b.lat + d).toFixed(4)}&ne_lng=${(b.lng + d).toFixed(4)}&sw_lat=${(b.lat - d).toFixed(4)}&sw_lng=${(b.lng - d).toFixed(4)}` },
      { name: "מלונות במפה", url: `https://www.google.com/maps/search/hotels/@${b.lat},${b.lng},16z` }
    ];
  }
  const airline = c => AIRLINE[c] || c || "";

  /* ---------- the two screens: 'when do you fly' and 'where to sleep' (helpers come from the app) ---------- */
  function install(U) {
    const { S, SCREENS, $, esc, ic, go, toast, track, partnerUrl, COST, planner, hasXY, rerenderKeepScroll, renderMap, svc } = U;
    const km = U.km;
    /* ================= where they sleep: a search like the one at the top, with a clear "found it" ================= */
    function hotelOkText() {
      const f = S.form, h = f.hotelPick;
      if (h && h.name === f.hotelName) return `<span class="ok">${ic("check", 2.6)}מצאנו: <b>${esc(h.name)}</b>${h.address ? ` · ${esc(h.address)}` : ""}. המסלול יתחיל ויסתיים כאן.</span>`;
      if (f.hotelState === "searching") return `<span class="muted">מחפשים…</span>`;
      if (f.hotelState === "none") return `<span class="muted">לא מצאנו בשם הזה. אפשר לכתוב את הכתובת, או להשאיר כך ונחפש שוב כשנבנה את המסלול.</span>`;
      if ((f.hotelName || "").trim().length >= 3 && f.hotelState === "list") return `<span class="muted">בחרו מהרשימה כדי שנדע בדיוק איפה זה.</span>`;
      return "";
    }
    let hotelT = null, hotelSeq = 0;
    function bindHotel() {
      const f = S.form, inp = $("hotelInput"), sug = $("hotelSug");
      if (!inp) return;
      const city = Masa.cities.findCity(S.dest?.q || "");
      const at = city ? { lat: city.lat, lng: city.lng } : hasXY(S.dest || {}) ? S.dest : null;
      const show = () => { const el = $("hotelOk"); if (el) el.innerHTML = hotelOkText(); };
      const choose = h => { f.hotelPick = h; f.hotelName = h.name; inp.value = h.name; sug.innerHTML = ""; f.hotelState = ""; show(); };
      const row = (h, i) => `<button type="button" role="option" data-h="${i}">${ic(h.kind === "apartment" ? "pin" : "bed", 2.2)}<span>${esc(h.name)}${h.address ? `<small>${esc(h.address)}</small>` : ""}</span></button>`;
      const draw = list => {
        if (!sug.isConnected) return;
        sug.innerHTML = list.map(row).join("");
        sug.querySelectorAll("[data-h]").forEach(b => b.onclick = () => choose(list[+b.dataset.h]));
      };
      inp.oninput = () => {
        f.hotelName = inp.value.slice(0, 120);
        if (f.hotelPick && f.hotelPick.name !== f.hotelName) f.hotelPick = null;
        const q = f.hotelName.trim(), seq = ++hotelSeq;
        clearTimeout(hotelT);
        if (q.length < 2) { sug.innerHTML = ""; f.hotelState = ""; return show(); }
        // the city's own hotels at once
        const N = Masa.intent.norm, nq = N(q);
        const local = city ? planner.hotelIndex(city.slug) : Promise.resolve([]);
        local.then(hs => {
          if (seq !== hotelSeq) return;
          const mine = hs.filter(h => [h.name, h.local].some(n => N(n).includes(nq) || N(n).split(" ").some(w => w.startsWith(nq)))).slice(0, 5);
          if (mine.length) { f.hotelState = "list"; draw(mine); show(); }
          // and the whole map, a moment after they stop typing (the map's search asks for one request a second)
          if (q.length < 3 || !at) return;
          hotelT = setTimeout(async () => {
            if (!mine.length) { f.hotelState = "searching"; show(); }
            let r = [];
            try { r = await svc.searchNear(q, at.lat, at.lng); } catch {}
            if (seq !== hotelSeq) return;
            const stay = x => x.category === "tourism" && /hotel|hostel|guest_house|apartment|motel/.test(x.type);
            const more = r.filter(x => km(at, x) < 25).sort((a, b) => stay(b) - stay(a)).map(x => ({ id: `${x.osmType}/${x.osmId}`, name: stay(x) ? x.name : q, local: x.local, kind: stay(x) ? (x.type === "hostel" ? "hostel" : "hotel") : "apartment", lat: x.lat, lng: x.lng, address: x.address }))
              .filter(x => !mine.some(m => km(m, x) < 0.05)).slice(0, 6 - Math.min(3, mine.length));
            const all = [...mine.slice(0, 3), ...more];
            f.hotelState = all.length ? "list" : "none";
            draw(all); show();
          }, 700);
        });
      };
      inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); sug.querySelector("[data-h]")?.click(); } };
    }
    const backDate = f => J.add(f.start, f.days);
    const dayWord = n => n === 1 ? "יום אחד" : n + " ימים";
    const steppers = f => `<div class="section-label">כמה ימים</div>
        <div class="stepper"><button type="button" class="iconbtn" id="dminus" aria-label="פחות ימים" style="background:var(--surface)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button><output id="dval">${dayWord(f.days)}</output><button type="button" class="iconbtn" id="dplus" aria-label="יותר ימים" style="background:var(--surface)">${ic("plus", 2.4)}</button></div>
        <div class="twocol">
          <label class="field"><span class="section-label">יוצאים ב-</span><input type="date" id="startDate" class="select" value="${esc(f.start || "")}"></label>
          <label class="field"><span class="section-label">מטיילים</span><span class="stepper small"><button type="button" class="iconbtn" id="pminus" aria-label="פחות מטיילים" style="background:var(--surface)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button><output id="pval">${f.people}</output><button type="button" class="iconbtn" id="pplus" aria-label="יותר מטיילים" style="background:var(--surface)">${ic("plus", 2.4)}</button></span></label>
        </div>
        <p class="muted backday" id="backDay">חוזרים ביום ${J.dayName(backDate(f))}, ${J.short(backDate(f))}</p>`;
    function bindSteppers(onChange) {
      const f = S.form, touched = f.touched = f.touched || new Set();
      const redo = () => { $("dval").textContent = dayWord(f.days); $("pval").textContent = f.people; $("backDay").textContent = `חוזרים ביום ${J.dayName(backDate(f))}, ${J.short(backDate(f))}`; onChange?.(); };
      $("dminus").onclick = () => { touched.add("days"); f.days = Math.max(1, f.days - 1); redo(); };
      $("dplus").onclick = () => { touched.add("days"); f.days = Math.min(5, f.days + 1); redo(); };
      $("pminus").onclick = () => { touched.add("people"); f.people = Math.max(1, f.people - 1); redo(); };
      $("pplus").onclick = () => { touched.add("people"); f.people = Math.min(8, f.people + 1); redo(); };
      $("startDate").onchange = e => { if (/^\d{4}-\d\d-\d\d$/.test(e.target.value)) { f.start = e.target.value; redo(); } };
    }
    /* the flights card: the cheapest on their dates, cheaper days around them, and the same search on the big sites */
    function flightsHtml() {
      const J = Masa.journey, f = S.form, to = J.airFor(Masa.cities.findCity(S.dest?.q || "")?.slug), back = backDate(f), F = S.fl;
      const links = to ? J.searchLinks(to, f.start, back, f.people) : [{ name: "Google Flights", url: `https://www.google.com/travel/flights?hl=iw&q=${encodeURIComponent(`Flights from TLV to ${S.dest?.q || ""} on ${f.start} through ${back}`)}` }];
      const linkRow = `<div class="linkrow">${links.map(l => `<a class="chipbtn" href="${esc(partnerUrl(l.url))}" target="_blank" rel="noopener sponsored">${ic("ext")}${esc(l.name)}</a>`).join("")}</div>`;
      const head = `<h2>${ic("route")} טיסות מתל אביב <small class="muted">${J.short(f.start)}–${J.short(back)}, ${f.people === 1 ? "נוסע אחד" : f.people + " נוסעים"}</small></h2>`;
      if (!to || !window.MASA_AI?.proxy || F?.off) return `${head}<p class="lead">השוו מחירים לתאריכים שלכם באתרים הגדולים:</p>${linkRow}`;
      if (!F || F.loading) return `${head}<div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:64px"></div>`;
      const per = p => f.people > 1 ? `<small>₪${p.toLocaleString("he-IL")} לאדם · ₪${(p * f.people).toLocaleString("he-IL")} ל-${f.people}</small>` : `<small>לאדם, הלוך ושוב</small>`;
      const stops = n => n === 0 ? "ישירה" : n === 1 ? "עצירה אחת" : `${n} עצירות`;
      const row = x => `<div class="flrow"><span class="flprice"><b>₪${x.price.toLocaleString("he-IL")}</b>${per(x.price)}</span>
          <span class="flmain"><b>${esc(J.airline(x.airline))}</b><small>${stops(x.stops)}${J.hhmm(x.depart) ? ` · יוצאת ${esc(J.hhmm(x.depart))}` : ""}${x.back && J.hhmm(x.back) ? ` · חוזרת ${esc(J.hhmm(x.back))}` : ""}</small></span>
          ${x.link ? `<a class="btn small" href="${esc(x.link)}" target="_blank" rel="noopener sponsored">להזמנה</a>` : ""}</div>`;
      const list = F.list?.length ? F.list.map(row).join("") : `<p class="lead">לא מצאנו מחירים שמורים לתאריכים האלה בדיוק. אפשר לחפש אותם עכשיו באתרים למטה.</p>`;
      const around = F.around?.length ? `<div class="flaround"><small>זול יותר בימים קרובים (אותו מספר ימים):</small>${F.around.map(x => { const d = x.depart.slice(0, 10); return `<button type="button" class="chip" data-fld="${esc(d)}">${J.dayName(d)} ${J.short(d)} · ₪${x.price.toLocaleString("he-IL")}</button>`; }).join("")}</div>` : "";
      return `${head}${list}${around}<p class="disclaim small">${ic("info")}<span>מחירים מחיפושים אחרונים ב-Aviasales, ויכולים להשתנות. ההזמנה באתר שלהם, ואם תזמינו דרכו מסע עשוי לקבל עמלה קטנה, בלי תוספת למחיר.</span></p><small class="muted">להשוואה:</small>${linkRow}`;
    }
    let flSeq = 0;
    async function loadFlights() {
      const J = Masa.journey, f = S.form, to = J.airFor(Masa.cities.findCity(S.dest?.q || "")?.slug), proxy = window.MASA_AI?.proxy;
      const draw = () => { const el = $("flights"); if (el) { el.innerHTML = flightsHtml(); bindFlights(); } };
      if (!to || !proxy) { S.fl = { off: true }; return draw(); }
      const seq = ++flSeq;
      S.fl = { loading: true }; draw();
      const r = await J.flights(proxy, to, f.start, backDate(f));
      if (seq !== flSeq) return;
      S.fl = r || { list: [], around: [] }; draw();
      if (r && !r.off) track("flights", S.dest?.q, r.list?.length || 0);
    }
    function bindFlights() {
      document.querySelectorAll("[data-fld]").forEach(b => b.onclick = () => { S.form.start = b.dataset.fld; $("startDate").value = S.form.start; $("backDay").textContent = `חוזרים ביום ${J.dayName(backDate(S.form))}, ${J.short(backDate(S.form))}`; toast(`התאריכים עודכנו: ${J.short(S.form.start)}–${J.short(backDate(S.form))}`); loadFlights(); });
    }
    SCREENS.when = {
      view() {
        const f = S.form;
        return `<div class="screen">
        <div class="topnav"><button class="iconbtn" id="backHome" aria-label="חזרה">${ic("back")}</button><span class="stepof">שלב 2 מתוך 4</span><span style="width:38px"></span></div>
        <div><h1>מתי טסים ל${esc(S.dest?.he || "יעד")}?</h1><p class="lead">נמצא את הטיסות הכי זולות לתאריכים שלכם, וגם ימים קרובים שזולים יותר.</p></div>
        ${steppers(f)}
        <div class="card flights" id="flights">${flightsHtml()}</div>
        <button class="btn coral block" id="whenNext" type="button">המשך: איפה ישנים</button>
        <button class="linkbtn" id="whenSkip" type="button">כבר יש לנו טיסה, ממשיכים</button>
      </div>`;
      },
      bind() {
        $("backHome").onclick = () => go("home");
        let t = null;
        bindSteppers(() => { clearTimeout(t); t = setTimeout(loadFlights, 450); });
        bindFlights();
        $("whenNext").onclick = $("whenSkip").onclick = () => go("stay");
        if (!S.fl || S.fl.key !== `${S.dest?.q}|${S.form.start}|${S.form.days}`) { loadFlights().then(() => { if (S.fl) S.fl.key = `${S.dest?.q}|${S.form.start}|${S.form.days}`; }); }
      }
    };
    /* where to sleep: the spot closest to most of what is worth seeing, the sites to book it, or the hotel they already have */
    async function loadBases() {
      const city = Masa.cities.findCity(S.dest?.q || ""), key = S.dest?.q;
      if (S.bases?.key === key) return;
      S.bases = { key, loading: true };
      let places = [], areas = [];
      if (city) [places, areas] = await Promise.all([planner.placeIndex(city.slug), planner.heAreas(city.slug)]);
      const center = city ? { lat: city.lat, lng: city.lng } : hasXY(S.dest || {}) ? S.dest : null;
      S.bases = { key, list: J.bases(places, areas, center, S.form.interests, city?.he || S.dest?.he || "") };
      if (S.screen === "stay") { rerenderKeepScroll(); renderMap(); }
    }
    function basesHtml() {
      const B = S.bases, f = S.form, J = Masa.journey, back = backDate(f), city = S.dest?.he || "";
      if (!B || B.loading) return `<div class="skeleton" style="height:120px"></div>`;
      if (!B.list.length) return "";
      const cc = Masa.cities.findCity(S.dest?.q || "")?.cc, slug = Masa.cities.findCity(S.dest?.q || "")?.slug;
      const n = COST && cc ? COST.night(null, cc, slug, f.budget) : null;
      return B.list.map((b, i) => {
        const on = f.hotelPick?.base && f.hotelPick.lat === b.lat && f.hotelPick.lng === b.lng;
        return `<div class="card base${on ? " on" : ""}"><span class="eyebrow">${i === 0 ? "הכי מומלץ" : "אפשרות נוספת"}</span><h2>${ic("bed")} ${esc(b.name)}</h2>
          ${b.n ? `<p class="lead">${b.n} מהמקומות הכי מבוקשים במרחק הליכה${b.near.length ? `: ${b.near.map(esc).join(", ")}` : ""}.</p>` : `<p class="lead">קרוב לכל מה שבעיר, ונוח להגיע ממנו לכל מקום.</p>`}
          ${n ? `<p class="muted">מלון בינוני באזור: כ-${COST.ilsRange(n.lo, n.hi)} ללילה לחדר זוגי</p>` : ""}
          <div class="linkrow">${J.stayLinks(b, S.dest?.q || city, f.start, back, f.people).map(l => `<a class="chipbtn" href="${esc(partnerUrl(l.url))}" target="_blank" rel="noopener sponsored">${ic("ext")}${esc(l.name)}</a>`).join("")}</div>
          <button type="button" class="btn ${on ? "coral" : "soft"} small" data-base="${i}" aria-pressed="${on}">${on ? `${ic("check", 2.6)} המסלול יתחיל מכאן` : "המסלול יתחיל מכאן"}</button></div>`;
      }).join("");
    }
    SCREENS.stay = {
      view() {
        const f = S.form;
        return `<div class="screen">
        <div class="topnav"><button class="iconbtn" id="backWhen" aria-label="חזרה">${ic("back")}</button><span class="stepof">שלב 3 מתוך 4</span><span style="width:38px"></span></div>
        <div><h1>איפה כדאי לישון ב${esc(S.dest?.he || "יעד")}?</h1><p class="lead">חיפשנו את האזור שהכי קרוב לרוב המקומות שכדאי לראות, כדי ללכת פחות ולראות יותר.</p></div>
        <div id="bases">${basesHtml()}</div>
        <label class="field"><span class="section-label">כבר יש לכם מלון? <small class="muted">המסלול יתחיל ויסתיים לידו</small></span>
          <span class="search hotelfield">${ic("bed")}<input id="hotelInput" type="text" value="${esc(f.hotelPick?.base ? "" : f.hotelName || "")}" placeholder="שם המלון או הכתובת" autocomplete="off" aria-label="שם המלון או הכתובת" aria-controls="hotelSug" aria-autocomplete="list"></span></label>
        <div class="sugs" id="hotelSug" role="listbox"></div>
        <p class="hotelok" id="hotelOk" aria-live="polite">${f.hotelPick?.base ? "" : hotelOkText()}</p>
        <button class="btn coral block" id="stayNext" type="button">המשך: מה בא לכם</button>
      </div>`;
      },
      bind() {
        $("backWhen").onclick = () => go("when");
        $("stayNext").onclick = () => go("goals");
        bindHotel();
        document.querySelectorAll("[data-base]").forEach(btn => btn.onclick = () => {
          const b = S.bases.list[+btn.dataset.base], f = S.form;
          if (f.hotelPick?.base && f.hotelPick.lat === b.lat) { f.hotelPick = null; f.hotelName = ""; }
          else { const name = `ליד ${b.name.replace(/^האזור של /, "")}`; f.hotelPick = { id: "base", base: true, name, local: name, kind: "apartment", lat: b.lat, lng: b.lng, address: "" }; f.hotelName = name; }
          rerenderKeepScroll(); renderMap();
        });
        loadBases();
      }
    };
  }
  const J = { airFor, flights, searchLinks, bases, stayLinks, add, iso, dayName, short, hhmm, airline, install };
  return J;
})();
