/* מסע · the agent on the route (loaded only when a trip is open).
   The traveler says in their own words what to change ("יום שני רגוע יותר", "בלי מוזיאונים", "תוסיף שוק אוכל"):
   the smart guide answers with changes to the trip (remove, move to another day, add a place of the city, replace one
   with another) and three new suggestions that fit the trip as it is now. The changes are made at once, the map and the
   times follow, and one tap undoes them. Without the smart guide, the guide's own answers on the device are used.
   The guide only picks from the stops and the city's places it is given (by id), so it cannot invent a place. */
(function () {
  "use strict";
  let U = null;
  const A = { say: "", chips: null, undo: null, busy: false, acts: null, closed: false, tripId: null };

  const nameOf = s => s._he && s._he !== s.name ? `${s.name} (${s._he})` : s.name;
  const walk = d => { let k = 0; for (let i = 1; i < d.stops.length; i++) k += U.km(d.stops[i - 1], d.stops[i]); return k * 1.25; };

  /* suggestions before the first answer, from the trip itself */
  function startChips(t) {
    const out = [];
    const heavy = t.days.map((d, i) => ({ i, k: walk(d) })).sort((a, b) => b.k - a.k)[0];
    if (heavy && heavy.k > 6) out.push(`פחות הליכה ב${t.days[heavy.i].label}`);
    const kinds = new Set(t.days.flatMap(d => d.stops.map(s => s.kind)));
    if (!kinds.has("market")) out.push("להוסיף שוק אוכל מקומי");
    if (!kinds.has("view") && !kinds.has("park")) out.push("מקום יפה לשקיעה");
    else out.push("יום רגוע יותר");
    if (kinds.has("museum")) out.push("פחות מוזיאונים");
    out.push("משהו מיוחד שתיירים לא מכירים");
    return out.slice(0, 4);
  }

  const reset = t => { if (A.tripId !== t.id) Object.assign(A, { say: "", chips: null, undo: null, acts: null, closed: false, tripId: t.id }); };
  const chipsOf = t => { reset(t); return A.chips || startChips(t); };

  /* the bar at the bottom of the route: the last answer, suggestions to tap, and a box to write in */
  function bar(t) {
    if (!t || t.source === "sample") return "";
    reset(t);
    const chips = chipsOf(t), { esc, ic } = U;
    const say = A.busy ? `<div class="agentsay busy" aria-live="polite"><i></i>מסדרים את המסלול…</div>`
      : A.say && !A.closed ? `<div class="agentsay" aria-live="polite"><button type="button" class="agentx" id="agentX" aria-label="סגירה">×</button>${U.richText(A.say)}${A.acts?.length ? `<div class="msgacts">${A.acts.map(a => `<button type="button" class="chipbtn" data-gact="${a.id}">${esc(a.label)}</button>`).join("")}</div>` : ""}${A.undo ? `<button type="button" class="linkbtn" id="agentUndo">${ic("back")}לבטל את השינוי</button>` : ""}</div>` : "";
    return `<div class="agentbar" id="agent">${say}
      <div class="agentchips" aria-label="הצעות">${chips.map((c, i) => `<button type="button" class="chipbtn" data-ach="${i}">${esc(c)}</button>`).join("")}</div>
      <form class="agentform" id="agentForm"><span class="sp">${ic("sparkle")}</span><input id="agentIn" type="text" maxlength="300" autocomplete="off" placeholder="מה לשנות? כתבו לסוכן…" aria-label="מה לשנות במסלול? כתבו לסוכן"><button class="btn small" type="submit" aria-label="שליחה" ${A.busy ? "disabled" : ""}>${ic("nav")}</button></form>
    </div>`;
  }
  function bind(t) {
    const el = U.$("agent"); if (!el) return;
    const chips = chipsOf(t);
    el.querySelectorAll("[data-ach]").forEach(b => b.onclick = () => ask(U.S.trip, chips[+b.dataset.ach]));
    U.$("agentForm").onsubmit = e => { e.preventDefault(); const v = U.$("agentIn").value.trim(); if (v) ask(U.S.trip, v); };
    U.$("agentUndo") && (U.$("agentUndo").onclick = () => undo(U.S.trip));
    U.$("agentX") && (U.$("agentX").onclick = () => { A.closed = true; U.$("agentX").parentElement.remove(); });
    U.bindGuideActs(el);
  }

  const refresh = () => { if (U.S.screen === "plan") U.rerenderKeepScroll(); };

  /* ---------- what the guide is told ---------- */
  function candidates(t) {
    const inTrip = new Set(t.days.flatMap(d => d.stops.map(s => s.name)));
    const pool = (t.places || []).filter(p => U.hasXY(p) && !inTrip.has(p.name) && !U.HOTEL_KINDS.includes(p.kind));
    const best = (f, n) => pool.filter(f).sort((a, b) => (b.q || 0) + (b.fame || 0) / 20 - (a.q || 0) - (a.fame || 0) / 20).slice(0, n);
    const food = ["restaurant", "cafe", "bakery", "dessert", "market", "deli", "bar", "club"];
    const seen = new Set(), out = [];
    for (const p of [...best(p => !food.includes(p.kind), 45), ...best(p => food.includes(p.kind), 25)]) if (!seen.has(p.name)) { seen.add(p.name); out.push(p); }
    return out;
  }
  function nearestDay(t, p) {
    let bi = 0, bk = Infinity;
    t.days.forEach((d, i) => d.stops.forEach(s => { const k = U.km(s, p); if (k < bk) { bk = k; bi = i; } }));
    return bi;
  }
  const SYSTEM = `You are the trip planner inside "מסע", a Hebrew travel app. The traveler looks at their trip and writes to you: something to change, something to arrange, or any question about the trip and the city. You get THE TRIP (stops by id), PLACES (the city's places not in the trip, by id) and what they wrote.
Change the trip to do what they asked, as a great local guide would:
- Use only the given ids: stops "s<day>.<n>", places "p<n>". Never invent a place. Do not list stops that stay as they are.
- Each action: {"do":"remove","stop":"s1.3"} or {"do":"move","stop":"s1.3","day":2} or {"do":"add","place":"p4","day":1} or {"do":"replace","stop":"s2.1","place":"p7"}. "move" and "add" always need "day" (a day number).
- "say" must match the actions exactly: never say you changed something you did not put in "actions". A place already in the trip cannot be added.
- A lighter or calmer day, or less walking: remove one or two of its least important sights, or replace far ones with near ones.
- Keep breakfast/lunch/dinner stops unless they ask about food; to change a meal, replace it with another eating place near it.
- Keep stops marked "asked" unless they ask to remove them. Add places to the day they are near. At most 6 actions.
- Be decisive, like a personal assistant who knows the city: when what they write means the plan should change (they are tired, it rains, they are late, they want something else, "תסדר לי", "מה כדאי עכשיו", "תשנה"), make the change yourself in "actions" and tell them what you did. Do not ask them to choose and do not tell them how to do it; they can undo.
- If they only ask a question (history, how to get somewhere, what is good to eat, prices, tips), answer it fully in "say" (up to about 120 words, concrete, with real place names and their local names in parentheses) and give no actions, unless a change clearly helps. If nothing in the lists fits a change, say so (for a place not in the lists, suggest searching it in the search bar).
Appointments and reminders (the traveler is your assistant's boss, like a personal secretary):
- A fixed appointment they tell you about (a meeting, a reservation they made, a tour, a show: "יש לי פגישה ביום שני ב-14:00 ב-Rothschild 22", "הזמנתי שולחן ב-20:00 ב-X"): {"do":"appt","day":2,"time":"14:00","minutes":60,"title":"פגישה","where":"Rothschild 22"}. "where" is the address or place name exactly as they wrote it (in its original language), "" if they gave none. "minutes" is how long it takes (default 60; a dinner 90; a show 150). If it falls on a meal of that day, also remove that meal stop.
- Something to remember ("תזכיר לי לעשות צ'ק-אין מחר ב-10", "להתקשר למלון ביום 2 בבוקר"): {"do":"remind","day":1,"time":"10:00","text":"צ'ק-אין לטיסה"}. "day" is the trip day (0 = before the trip starts, then "date" "YYYY-MM-DD" if they said one). "time" "HH:MM" (09:00 if they said none).
- A table to book ("תזמין לי מסעדה ב-20:00 ביום 2", "מקום לארוחת ערב רומנטית מחר", "שולחן לארבעה בצהריים"): choose ONE restaurant from PLACES (its p-id) near that day's stops that fits what they asked (cuisine, kosher, budget, mood), and answer {"do":"appt","day":2,"time":"20:00","minutes":90,"title":"ארוחת ערב ב-<its name>","place":"p12"} (no "where"; add "party":4 when they said how many people: "לארבעה" 4, "לזוג"/"לשנינו" 2). Also remove that day's dinner (or lunch) stop. In "say" name the place and one reason, and tell them the reservation message is ready: they tap the button and send it.
- Never say you booked or paid anything: you add it to the plan and the calendar; booking is done by them with the button.
"say": Hebrew, warm, speaking to them in plural (אתם, e.g. "שתיהנו", "ביקשתם"). After a change: at most 2 short sentences, what you changed and why, naming the places. For a question: the answer itself.
"chips": 3 short Hebrew suggestions (max 30 characters each) for their next change, specific to this trip and city now, each starting with an infinitive verb (e.g. "להוסיף גלידה בג'וליטי", "לקצר את יום 1").
Answer with one JSON object: {"say":"...","actions":[...],"chips":["...","...","..."]}`;
  const SHAPE = { type: "OBJECT", properties: {
    say: { type: "STRING" },
    actions: { type: "ARRAY", items: { type: "OBJECT", properties: { do: { type: "STRING", enum: ["remove", "move", "add", "replace", "appt", "remind"] }, time: { type: "STRING" }, minutes: { type: "NUMBER" }, title: { type: "STRING" }, where: { type: "STRING" }, text: { type: "STRING" }, date: { type: "STRING" }, party: { type: "NUMBER" }, stop: { type: "STRING" }, place: { type: "STRING" }, day: { type: "INTEGER" } }, required: ["do"] } },
    chips: { type: "ARRAY", items: { type: "STRING" } } }, required: ["say", "actions", "chips"], propertyOrdering: ["say", "actions", "chips"] };
  const short = n => String(n).slice(0, 48);
  function prompt(t, text, cands) {
    const date = di => { try { const x = new Date(U.tripDates(t).start); x.setDate(x.getDate() + di); return x.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "numeric" }) + ", "; } catch { return ""; } };
    const days = t.days.map((d, di) => `Day ${di + 1} (${date(di)}${walk(d).toFixed(1)} km walking): ` + d.stops.map((s, i) =>
      `s${di + 1}.${i + 1} ${s.time ? s.time + " " : ""}${short(nameOf(s))} [${s.at != null ? "appointment" : s.meal ? "meal:" + s.meal : s.kind || s.cat}${s.asked ? ",asked" : ""}]`).join("; ")).join("\n");
    // the last turns of the chat, so "and also…" or "not that one" make sense (short, and only text)
    const log = (U.S.chatLog || []).slice(-7, -1).filter(m => m.t && m.t !== "חושב…" && m.t !== "מסדרים את המסלול…")
      .map(m => `${m.r === "me" ? "traveler" : "you"}: ${String(m.t).replace(/\s+/g, " ").slice(0, 160)}`).join("\n");
    const now = U.S.me ? `\nTheir live location now: ${(+U.S.me.lat).toFixed(4)},${(+U.S.me.lng).toFixed(4)}.` : "";
    const head = `City: ${t.cityEn || t.city}, ${t.country || ""}. ${t.days.length} days, moving by ${t.opts?.move || "walk"}.${t.opts?.ages?.length ? ` Travelers' ages: ${t.opts.ages.join(", ")} (baby 0-3, kids 4-12, teens 13-17, young 18-30, adults 30-60, senior 60+): fit every suggestion to them.` : ""} Today on their screen: day ${(U.S.day || 0) + 1}.${now}\nTHE TRIP:\n${days}\n${log ? `EARLIER IN THIS CHAT:\n${log}\n` : ""}THE TRAVELER WROTE (Hebrew): """${String(text).slice(0, 300)}"""\nPLACES:\n`;
    // the places fill what is left of the message (the guide server keeps 6000 characters of it)
    let out = head, n = 0;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i], extra = [c.cuisine, c.kosher ? "kosher" : "", c.up || c.michelin ? "upscale" : c.voyage?.priceClass === "budget" ? "cheap" : ""].filter(Boolean).join(",");
      const line = `p${i + 1} ${short(nameOf(c))} [${c.kind}${extra ? ":" + extra : ""}, day ${nearestDay(t, c) + 1}]\n`;
      if (out.length + line.length > 5800) break;
      out += line; n++;
    }
    return out;
  }
  /* ---------- making the changes ---------- */
  /* the day they named ("היום האחרון", "יום 2", "ביום השני"), for a change the guide gave without a day */
  const ORD = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי"];
  function dayFromText(t, text) {
    const q = String(text || ""), n = t.days.length;
    if (/(האחרון|אחרון|בסוף הטיול)/.test(q)) return n;
    const m = q.match(/יום\s*(\d{1,2})/); if (m && +m[1] >= 1 && +m[1] <= n) return +m[1];
    const o = ORD.findIndex(w => new RegExp(`(?:היום|ביום|ליום)\\s+ה?${w}`).test(q));
    return o >= 0 && o < n ? o + 1 : null;
  }
  function apply(t, actions, cands, text) {
    const stopAt = id => { const m = /^s(\d+)\.(\d+)$/.exec(String(id || "")); if (!m) return null; const d = t.days[+m[1] - 1], s = d?.stops[+m[2] - 1]; return s ? { d, s } : null; };
    const placeAt = id => { const m = /^p(\d+)$/.exec(String(id || "")); return m ? cands[+m[1] - 1] || null : null; };
    const dayAt = n => t.days[Math.round(+n) - 1] || null, said = dayFromText(t, text);
    // resolve every id against the trip as the guide saw it, before anything moves
    const plan = (Array.isArray(actions) ? actions : []).slice(0, 6).map(a => ({ a, st: stopAt(a?.stop), p: placeAt(a?.place), to: dayAt(a?.day) || (said ? dayAt(said) : null) || (a?.do === "add" && stopAt(a?.stop) ? stopAt(a.stop).d : null) }));
    const touched = new Set(), used = new Set(), done = [], cal = [], book = [];
    for (const { a, st, p, to } of plan) {
      const k = a?.do;
      if (k === "remove" && st && st.s.meal !== "hotel") {
        const i = st.d.stops.indexOf(st.s); if (i < 0) continue;
        st.d.stops.splice(i, 1); touched.add(st.d); done.push({ c: "-", n: st.s.name });
      } else if (k === "move" && st && to && to !== st.d && st.s.meal !== "hotel") {
        const i = st.d.stops.indexOf(st.s); if (i < 0) continue;
        st.d.stops.splice(i, 1);
        if (st.s.meal && to.stops.some(x => x.meal === st.s.meal)) { delete st.s.meal; delete st.s.mealHe; }
        to.stops.push(st.s); to.manualOrder = false; touched.add(st.d); touched.add(to); done.push({ c: ">", n: st.s.name });
      } else if (k === "add" && p && !used.has(p.name)) {
        const d = to || t.days[nearestDay(t, p)];
        if (d.stops.some(s => s.name === p.name)) continue;
        const s = Object.assign(U.stopFrom({ ...p, why: p.vtext || U.planner.KIND[p.kind]?.he || "" }), { osm: p.id, kind: p.kind, kindHe: U.planner.KIND[p.kind]?.he, cuisine: p.cuisine, priceClass: p.priceClass, signals: p.signals || [], hours: p.hours, phone: p.phone, address: p.address, website: p.website, _he: p._he || null });
        d.stops.push(s); d.manualOrder = false; used.add(p.name); touched.add(d); done.push({ c: "+", n: p.name });
      } else if (k === "appt" && a.loc && (to || dayAt(1))) {
        const d = to || dayAt(1), at = hm(a.time);
        if (at == null) continue;
        const mins = Math.max(15, Math.min(300, Math.round(+a.minutes || 60)));
        const title = clean(a.title) || "פגישה";
        const s = { name: title, local: a.loc.local || a.loc.name, lat: a.loc.lat, lng: a.loc.lng, address: a.loc.address || "", kind: "appt", kindHe: "פגישה", at, asked: true,
          _min: mins, duration: U.fmtDur ? U.fmtDur(mins) : `${mins} דקות`, why: `${title}${a.loc.address ? " · " + a.loc.address : ""}`, tip: "שעה קבועה: המסלול מסתדר סביבה." };
        if (a.venue) {
          const v = a.venue;
          Object.assign(s, { osm: v.id, cuisine: v.cuisine, phone: v.phone, website: v.website, hours: v.hours, kindHe: "שולחן שמור", tip: "שעה קבועה. להזמנת השולחן: הכפתור בצ'אט או באתר של המסעדה." });
          // the table replaces that day's meal at about the same hour
          const meal = at >= 17 * 60 ? "dinner" : at >= 11 * 60 && at < 16 * 60 ? "lunch" : null, mi = meal ? d.stops.findIndex(x => x.meal === meal) : -1;
          if (mi >= 0) { done.push({ c: "-", n: d.stops[mi].name }); d.stops.splice(mi, 1); }
          book.push({ v, at, di: t.days.indexOf(d), party: Math.max(1, Math.min(20, Math.round(+a.party) || 2)) });
        }
        d.stops.push(s); touched.add(d); done.push({ c: "@", n: `${title} ב-${fmtHM(at)}` }); cal.push({ day: t.days.indexOf(d), at, mins, title, where: a.loc.address || a.loc.name, lat: a.loc.lat, lng: a.loc.lng });
      } else if (k === "remind" && clean(a.text)) {
        const at = hm(a.time) ?? 540, di = Math.round(+a.day || 0) - 1;
        const r = { text: clean(a.text), at, day: di, date: /^\d{4}-\d{2}-\d{2}$/.test(a.date || "") ? a.date : null };
        (t.reminders = t.reminders || []).push(r); done.push({ c: "!", n: r.text }); cal.push({ day: di, date: r.date, at, mins: 15, title: r.text, remind: true });
      } else if (k === "replace" && st && p && !used.has(p.name) && st.s.meal !== "hotel") {
        const di = t.days.indexOf(st.d), i = st.d.stops.indexOf(st.s); if (i < 0) continue;
        U.replaceAt(di, i, p); used.add(p.name); touched.add(st.d); done.push({ c: "~", n: p.name });
      }
    }
    for (const d of touched) {
      if (!d.manualOrder) U.planner.optimizeDay(d);
      U.planner.assignTimes(d); d.route = null; d.legs = null;
      // an appointment takes hours out of the day: the sights that no longer fit before the night go, latest first
      if (d.stops.some(s => s.at != null)) {
        const end = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.time || ""); return m ? (+m[1] < 5 ? 1440 : 0) + +m[1] * 60 + +m[2] : 0; };
        for (let n = 0; n < 12; n++) {
          const late = d.stops.filter(s => !s.meal || s.meal === "dinner").some(s => end(s) > 21.5 * 60 && s.meal !== "dinner") || end(d.stops.find(s => s.meal === "dinner") || { time: "" }) > 21 * 60;
          if (!late) break;
          let k = -1; d.stops.forEach((s, j) => { if (!s.meal && !s.asked && s.at == null) k = j; });
          if (k < 0) break;
          done.push({ c: "x", n: d.stops[k].name }); d.stops.splice(k, 1); U.planner.assignTimes(d);
        }
      }
    }
    return { touched: [...touched], done, cal, book };
  }
  const hm = x => { const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(x || "").trim()) || /^(\d{1,2})$/.exec(String(x || "").trim()); return m && +m[1] < 24 ? +m[1] * 60 + (+m[2] || 0) : null; };
  const fmtHM = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const clean = x => String(x || "").replace(/[<>`"]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

  /* the place of each appointment, found by its address or name near the city (before the changes are made) */
  async function locate(t, actions, cands) {
    for (const a of (Array.isArray(actions) ? actions : []).filter(a => a?.do === "appt")) {
      const pm = /^p(\d+)$/.exec(String(a.place || "")), v = pm ? cands[+pm[1] - 1] : null;
      if (v && U.hasXY(v)) { a.venue = v; a.loc = { name: v.name, local: v.local, lat: v.lat, lng: v.lng, address: v.address || "" }; continue; }
      const w = clean(a.where);
      if (!w) continue;
      const inList = [...t.days.flatMap(d => d.stops), ...cands].find(p => U.hasXY(p) && [p.name, p.local].some(n => n && n.toLowerCase() === w.toLowerCase()));
      if (inList) { a.loc = { name: inList.name, local: inList.local, lat: inList.lat, lng: inList.lng, address: inList.address || "" }; continue; }
      const r = await U.svc.searchPlace(w, t.lat, t.lng, t.cityEn || t.city).catch(() => []);
      if (r?.[0]) a.loc = r[0];
      else a.missing = w;
    }
  }

  /* a reservation request in the restaurant's own language, to send on WhatsApp (the traveler checks it and sends) */
  const phoneOf = v => { const p = String(v.phone || "").split(/[;,]/)[0].trim(); return p ? (p.startsWith("+") ? "+" : "") + p.replace(/\D/g, "") : ""; };
  const RESERVE = {
    he: ["בעברית", "שלום! אשמח להזמין שולחן ל-{n} אנשים ב{date} בשעה {time}.", "על שם {name}.", "תודה!"],
    en: ["באנגלית", "Hello! I would like to reserve a table for {n} on {date} at {time}.", "The name is {name}.", "Thank you!"],
    it: ["באיטלקית", "Buongiorno! Vorrei prenotare un tavolo per {n} persone {date} alle {time}.", "A nome di {name}.", "Grazie mille!"],
    fr: ["בצרפתית", "Bonjour ! Je voudrais réserver une table pour {n} personnes le {date} à {time}.", "Au nom de {name}.", "Merci beaucoup !"],
    es: ["בספרדית", "¡Hola! Quisiera reservar una mesa para {n} personas el {date} a las {time}.", "A nombre de {name}.", "¡Muchas gracias!"],
    de: ["בגרמנית", "Guten Tag! Ich möchte gerne einen Tisch für {n} Personen am {date} um {time} Uhr reservieren.", "Auf den Namen {name}.", "Vielen Dank!"],
    pt: ["בפורטוגזית", "Olá! Gostaria de reservar uma mesa para {n} pessoas para {date}, às {time}.", "Em nome de {name}.", "Muito obrigado!"],
    nl: ["בהולנדית", "Hallo! Ik wil graag een tafel reserveren voor {n} personen op {date} om {time}.", "Op naam van {name}.", "Hartelijk dank!"],
    el: ["ביוונית", "Γεια σας! Θα ήθελα να κλείσω ένα τραπέζι για {n} άτομα την {date} στις {time}.", "Στο όνομα {name}.", "Ευχαριστώ πολύ!"]
  };
  const LANG_OF = { il: "he", it: "it", sm: "it", va: "it", fr: "fr", be: "fr", lu: "fr", mc: "fr", es: "es", mx: "es", ar: "es", cl: "es", co: "es", pe: "es", cr: "es",
    de: "de", at: "de", ch: "de", pt: "pt", br: "pt", nl: "nl", gr: "el", cy: "el" };
  function reserveText(t, b) {
    const lang = LANG_OF[String(t.cc || "").toLowerCase()] || "en", L = RESERVE[lang];
    let date = `day ${b.di + 1}`;
    try { const x = new Date(U.tripDates(t).start); x.setDate(x.getDate() + b.di); if (!isNaN(x)) date = x.toLocaleDateString(lang === "he" ? "he-IL" : lang, { weekday: "long", day: "numeric", month: "long" }); } catch {}
    const name = (window.Masa?.cloud?.state?.user?.fullName || "").replace(/[<>]/g, "").trim();
    const n = lang === "en" ? (b.party === 1 ? "1 person" : `${b.party} people`) : String(b.party);
    const text = [L[1], name ? L[2] : "", L[3]].filter(Boolean).join(" ").replace("{n}", n).replace("{date}", date).replace("{time}", fmtHM(b.at)).replace("{name}", name);
    return { text, lang, he: L[0] };
  }

  /* the appointments and reminders it just added, as a calendar file for the phone */
  function calendar(t, items) {
    const start = new Date(U.tripDates(t).start), pad = n => String(n).padStart(2, "0"), tz = t.tz || "";
    const esc = x => String(x || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, " ");
    const dt = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Masa//Agent//HE"];
    items.forEach((c, i) => {
      const day = c.date ? new Date(c.date + "T00:00") : new Date(start.getTime() + Math.max(-1, c.day) * 864e5);
      const a = new Date(day); a.setHours(Math.floor(c.at / 60), c.at % 60, 0, 0);
      const b = new Date(a.getTime() + c.mins * 60000);
      L.push("BEGIN:VEVENT", `UID:masa-agent-${t.id}-${Date.now()}-${i}@masa`, `DTSTAMP:${dt(new Date())}`,
        tz && !c.remind ? `DTSTART;TZID=${tz}:${dt(a)}` : `DTSTART:${dt(a)}`, tz && !c.remind ? `DTEND;TZID=${tz}:${dt(b)}` : `DTEND:${dt(b)}`,
        `SUMMARY:${esc(c.title)}`, ...(c.where ? [`LOCATION:${esc(c.where)}`] : []),
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(c.title)}`, `TRIGGER:${c.remind ? "PT0M" : "-PT30M"}`, "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    const blob = new Blob([L.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "masa-reminder.ics";
    document.body.append(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 4000);
    U.toast("הקובץ ירד. פותחים אותו, וזה נכנס ליומן");
  }

  /* what changed, in plain words, when the guide did not say it */
  function describe(done) {
    const by = c => done.filter(x => x.c === c).map(x => x.n);
    const parts = [[by("-"), "הורדתי"], [by("+"), "הוספתי"], [by(">"), "העברתי ליום אחר"], [by("~"), "החלפתי ל"], [by("@"), "הכנסתי למסלול את"], [by("!"), "אזכיר לכם:"]].filter(([l]) => l.length).map(([l, w]) => `${w}${w.endsWith("ל") ? "" : ": "}${l.join(", ")}`);
    return parts.join(". ") + ".";
  }
  function finish(t, touched) {
    U.saveEdit(); U.renderMap(); refresh();
    for (const d of touched) U.planner.computeRoute(d).then(() => { if (U.S.trip === t) { U.renderMap(); refresh(); } }).catch(() => {});
  }

  /* from the bar on the route: the answer shows above the bar, and goes into the agent's conversation too */
  async function ask(t, text) {
    if (A.busy || !text) return;
    const r = await run(t, text);
    if (!r) return;
    U.S.chatLog.push({ r: "me", t: text }, { r: "bot", t: r.say, acts: r.acts || [] });
  }
  /* the change itself; the agent screen calls it too. Returns {say, acts} (acts: buttons, like "undo") */
  async function run(t, text) {
    if (A.busy || !text) return null;
    A.closed = false;
    if (!U.ai.enabled()) {
      // without the smart guide: the guide's answers on the device (remove, replace, a lighter day, food near by…)
      let r = null; try { r = U.localAnswer(text); } catch {}
      Object.assign(A, { say: r ? r.text : "בלי המדריך החכם אפשר לבקש: יום רגוע יותר, להוריד או להחליף תחנה, איפה לאכול קרוב, מה עושים בערב. או לשנות ידנית בכפתור 'לשנות את היום'.", acts: r?.acts || null, undo: null });
      refresh(); return { say: A.say, acts: A.acts };
    }
    const before = JSON.stringify(t.days);
    A.busy = true; A.acts = null; refresh();
    U.track("guide_ai", t.slug || t.cityEn, 2);
    try {
      const cands = candidates(t), snapshot = t.days.map(d => d.stops.map(x => x.name));
      // a slow answer (the guide server tries up to three models): after 25 seconds the device answers instead
      const j = await Promise.race([U.ai.structured(SYSTEM, prompt(t, text, cands), SHAPE),
        new Promise((_, no) => setTimeout(() => no(Object.assign(new Error("slow"), { code: "shared_quota" })), 25000))]);
      if (U.S.trip !== t) { A.busy = false; return null; }
      // some models answer with the list of changes only: take it as the changes
      const r = Array.isArray(j) ? { actions: j } : j || {};
      await locate(t, r.actions, cands);
      if (U.S.trip !== t) { A.busy = false; return null; }
      const { touched, done, cal, book } = apply(t, r.actions, cands, text);
      const missing = (r.actions || []).filter(a => a?.missing).map(a => a.missing);
      const chips = (Array.isArray(r.chips) ? r.chips : []).map(c => String(c || "").replace(/<[^>]*>/g, "").replace(/[<>"`]/g, "").trim().slice(0, 34)).filter(Boolean).slice(0, 3);
      const idName = id => { const m = /^s(\d+)\.(\d+)$/.exec(id); if (m) return snapshot[+m[1] - 1]?.[+m[2] - 1] || ""; const k = /^p(\d+)$/.exec(id); return k ? cands[+k[1] - 1]?.name || "" : ""; };
      let say = String(r.say || "").replace(/[<>`]/g, "").replace(/\b([sp]\d+(?:\.\d+)?)\b/g, (x, id) => idName(id))
        .replace(/[^\u0000-\u024F\u0590-\u05FF\u2000-\u206F\u20AA]/gu, "").replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim().slice(0, 400);
      // it said it changed something but nothing it gave could be done: say that honestly
      if (!done.length && /(הוספ|הסר|הורד|העבר|החלפ|שינית|עדכנ|הכנסתי|אזכיר)/.test(say)) say = "";
      // a table it chose is not booked yet: never let the answer say otherwise
      if (book.length && /(הזמנתי|שמרתי שולחן|סגרתי|השולחן מוזמן|הזמנה בוצעה)/.test(say)) say = `שיבצתי את ${book[0].v.name} במסלול. כדי לשמור שולחן, לוחצים על הכפתור.`;
      const freed = done.filter(x => x.c === "x").map(x => x.n);
      if (freed.length) say = `${say} כדי לפנות זמן לפגישה, הורדתי: ${freed.join(", ")}.`.trim();
      if (missing.length) say = `${say ? say + " " : ""}לא מצאתי את הכתובת "${missing[0]}". כתבו כתובת מלאה (רחוב ומספר) ואכניס את זה למסלול.`.trim();
      Object.assign(A, { say: say || (done.length ? describe(done) : "לא מצאתי מה לשנות. נסו לכתוב את זה אחרת, או לשאול על מקום מסוים."), chips: chips.length ? chips : startChips(t).filter(c => c !== text), undo: done.length ? before : null });
      A.busy = false;
      const calAct = cal.length ? U.act("להוסיף ליומן בטלפון", () => calendar(t, cal)) : null;
      if (calAct) A.acts = [calAct];
      if (done.length) { finish(t, touched); U.toast("המסלול עודכן"); } else refresh();
      const acts = done.length ? [U.act("לבטל את השינוי", () => undo(U.S.trip))] : [];
      if (calAct) acts.unshift(calAct);
      const open = u => () => window.open(u, "_blank", "noopener");
      for (const b of book.slice(0, 2).reverse()) {
        const v = b.v, site = U.safeUrl(v.website), num = phoneOf(v), tel = num ? `tel:${num}` : "", msg = reserveText(t, b);
        const btns = [];
        // a ready message in the restaurant's language: they check it and press send (Masa never books by itself)
        if (num.startsWith("+")) btns.push(U.act(`לשלוח ל-${v.name} הודעת הזמנה בוואטסאפ`, open(`https://wa.me/${num.slice(1)}?text=${encodeURIComponent(msg.text)}`)));
        btns.push(site ? U.act(`להזמין באתר של ${v.name}`, open(v.website)) : tel ? U.act(`להתקשר ל-${v.name} ולהזמין`, open(tel))
          : U.act(`${v.name} בגוגל מפות (שם אפשר להזמין)`, open(U.gmPlace(v))));
        acts.unshift(...btns);
        if (num.startsWith("+") && !/הודעת הזמנה|הודעה מוכנה/.test(A.say)) A.say = `${A.say} הכנתי הודעת הזמנה ${msg.he} לוואטסאפ: לוחצים, בודקים ושולחים.`.trim();
      }
      if (book.length && !A.acts?.length) A.acts = acts.slice(0, Math.min(2, book.length + 1));
      if (!done.length && say) acts.push(...options(say, t));
      return { say: A.say, acts };
    } catch (e) {
      // the smart guide is busy or offline: the guide's answers on the device still work for the common changes
      let r = null; try { r = U.localAnswer(text); } catch {}
      Object.assign(A, { busy: false, say: r ? r.text : U.ai.errText(e.code), acts: r?.acts || null, undo: null }); refresh();
      return { say: A.say, acts: A.acts };
    }
  }

  function undo(t) {
    if (!A.undo) return;
    const days = JSON.parse(A.undo);
    t.days.splice(0, t.days.length, ...days);
    Object.assign(A, { undo: null, say: "החזרתי את המסלול למה שהיה." });
    U.saveEdit(); U.renderMap(); refresh();
    if (U.S.screen !== "plan") U.toast("המסלול חזר למה שהיה");
  }

  /* the places a guide's answer names, as things to do: go there, put it in the trip, or book it (a table, a room, a
     ticket: the booking itself is done by the traveler on the place's own site or a partner's, Masa never pays). Places
     the city's lists know get every button; a name in parentheses the lists do not know can still be opened in the map. */
  function options(text, t = U.S.trip) {
    const txt = String(text || ""), low = txt.toLowerCase(), out = [], seen = new Set();
    const known = (t.places || []).filter(p => U.hasXY(p) && (p.name || "").length > 3)
      .filter(p => [p.name, p.local].some(n => n && n.length > 3 && low.includes(n.toLowerCase())))
      .sort((a, b) => low.indexOf((a.local || a.name).toLowerCase()) - low.indexOf((b.local || b.name).toLowerCase()));
    const city = encodeURIComponent(t.cityEn || t.city || "");
    const bookFor = p => {
      const food = ["restaurant", "cafe", "bar", "bakery", "dessert", "deli", "club"].includes(p.kind);
      if (food) return U.safeUrl(p.website) ? ["להזמין שולחן באתר שלהם", p.website] : p.phone ? [`להתקשר להזמין (${p.phone})`, `tel:${String(p.phone).replace(/[^\d+]/g, "")}`] : null;
      if (U.HOTEL_KINDS.includes(p.kind)) return ["לבדוק מחירים ולהזמין", U.partnerUrl(`https://www.booking.com/searchresults.html?ss=${encodeURIComponent((p.local || p.name) + ", " + (t.cityEn || t.city))}`)];
      return ["כרטיסים וסיורים", U.partnerUrl(`https://www.getyourguide.com/s/?q=${encodeURIComponent((p.local || p.name) + " " + (t.cityEn || t.city))}`)];
    };
    const open = u => () => window.open(u, "_blank", "noopener");
    for (const p of known) {
      if (out.length >= 9 || seen.has(p.name)) continue; seen.add(p.name);
      const nm = p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name;
      const inTrip = t.days.some(d => d.stops.some(s => s.name === p.name));
      if (!inTrip) out.push(U.act(`+ ${nm} למסלול`, () => { U.addPlace(p, U.S.day); U.toast(`${p.name} נוסף ל${t.days[U.S.day].label}`); }));
      out.push(U.act(`ניווט ל${nm}`, open(U.gmPlace(p))));
      const bk = bookFor(p); if (bk) out.push(U.act(bk[0], open(bk[1])));
    }
    if (!out.length) for (const m of txt.matchAll(/\(([A-Za-zÀ-ÿ'’&.\- ]{3,40})\)/g)) {
      const n = m[1].trim(); if (seen.has(n) || out.length >= 3) continue; seen.add(n);
      out.push(U.act(`במפה: ${n}`, open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n)},${city}`)));
    }
    return out;
  }

  window.Masa = window.Masa || {};

  /* the trip as a KML file for Google My Maps (one folder and colour per day); moved here from app.js to keep the start small */
  const xmlEsc = v => String(v ?? "").replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
  const KMLC = ["ff6b4ae2", "ffe0a03b", "ff84a00e", "fff05a7a", "ff33c4ff"]; // the day colors, as KML wants them (aabbggrr)
  function tripKml(t) {
    const styles = KMLC.map((c, i) => `<Style id="d${i}"><IconStyle><color>${c}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle><LineStyle><color>${c}</color><width>4</width></LineStyle></Style>`).join("");
    const days = t.days.map((d, di) => {
      const pts = d.stops.filter(U.hasXY);
      const marks = pts.map((s, i) => {
        const desc = [s.time ? `${s.time}` : "", s.mealHe || "", s.tip || "", s.booking?.needed ? "כדאי להזמין מראש" : "", s.address || ""].filter(Boolean).join(" · ");
        return `<Placemark><name>${xmlEsc(`יום ${di + 1} · ${i + 1}. ${s.name}`)}</name>${desc ? `<description>${xmlEsc(desc)}</description>` : ""}<styleUrl>#d${di % 5}</styleUrl><Point><coordinates>${(+s.lng).toFixed(6)},${(+s.lat).toFixed(6)}</coordinates></Point></Placemark>`;
      }).join("");
      const line = pts.length > 1 ? `<Placemark><name>${xmlEsc(`יום ${di + 1}: המסלול`)}</name><styleUrl>#d${di % 5}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(s => `${(+s.lng).toFixed(6)},${(+s.lat).toFixed(6)}`).join(" ")}</coordinates></LineString></Placemark>` : "";
      return `<Folder><name>${xmlEsc(`יום ${di + 1}${d.theme ? `: ${d.theme}` : ""}`)}</name>${marks}${line}</Folder>`;
    }).join("");
    const hotel = t.hotel && U.hasXY(t.hotel) ? `<Placemark><name>${xmlEsc(`המלון: ${t.hotel.name}`)}</name><Point><coordinates>${(+t.hotel.lng).toFixed(6)},${(+t.hotel.lat).toFixed(6)}</coordinates></Point></Placemark>` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(`${t.days.length} ימים ב${t.city} · מסע`)}</name>${styles}${hotel}${days}</Document></kml>`;
  }
  function kml(t) {
    const blob = new Blob([tripKml(t)], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `masa-${(t.cityEn || t.slug || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.kml`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    U.toast("הקובץ ירד. עכשיו מייבאים אותו ל-My Maps, לפי השלבים");
  }

  /* the guide's free answer (news of today, things to look up on the web): a story, a fact, a place */
  async function chat(q) {
    const t = U.S.trip, cur = t.days[U.S.day].stops[U.S.stop];
    const compact = t.days.map(d => `${d.label}: ` + d.stops.map(s => `${s.name} (${s.local}, ${(+s.lat).toFixed(4)},${(+s.lng).toFixed(4)}, ${s.time || ""})`).join(" → ")).join("\n");
    const system = `You are "מסע", a warm, practical on-the-ground tour guide and storyteller in ${t.cityLocal || t.city}, ${t.country}. Answer in Hebrew, concrete and vivid, at most about 150 words. When asked about history, tell it like a guide standing on site: dates, people, details to look for. Do not invent facts you are not sure of. Give specific nearby place names with their local names (so they can be searched on Google Maps), walking times and what to do next. Never invent booking URLs. When they ask where to eat, sleep, go or what to do, give 2-3 real options (not one), each on its own "- " line starting with its name and its local name in parentheses, e.g. "- **Da Enzo** (Da Enzo al 29): …", then one short line on why, the price level and whether to reserve ahead. Answer any question about the trip, the city or travel there; if you are not sure of a fact, say so and say where to check.
Traveler's plan:
${compact}
Traveler is currently viewing: ${t.days[U.S.day].label}, stop ${U.S.stop + 1}: ${cur?.name} (${cur?.local}).${U.S.me ? `\nTraveler's live location: ${U.S.me.lat.toFixed(5)},${U.S.me.lng.toFixed(5)}.` : ""}`;
    U.S.chat.push({ role: "user", content: q });
    try {
      const fresh = U.ai.shared() && U.FRESH_Q.test(q) ? { q, city: t.cityEn || t.cityLocal || t.city } : null;
      U.track("guide_ai", t.slug || t.cityEn);
      const text = await U.ai.chat(system, U.S.chat.slice(-10), fresh);
      U.S.chat.push({ role: "assistant", content: text });
      return { t: text, links: fresh ? U.ai.lastSources() : [], acts: options(text, t) };
    } catch (e) { U.S.chat.pop(); throw e; }
  }

  window.Masa.agent = { install(u) { U = u; }, _reserve: (t, b) => reserveText(t, b), _phone: v => phoneOf(v), bar, bind, run, undo, options, chat, kml, chips: chipsOf, _state: A, _apply: apply, _candidates: candidates, _prompt: prompt, _system: SYSTEM };
})();
