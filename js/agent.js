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
  const SYSTEM = `You are the trip planner inside "מסע", a Hebrew travel app. The traveler looks at their trip and writes what to change. You get THE TRIP (stops by id), PLACES (the city's places not in the trip, by id) and what they wrote.
Change the trip to do what they asked, as a great local guide would:
- Use only the given ids: stops "s<day>.<n>", places "p<n>". Never invent a place. Do not list stops that stay as they are.
- Each action: {"do":"remove","stop":"s1.3"} or {"do":"move","stop":"s1.3","day":2} or {"do":"add","place":"p4","day":1} or {"do":"replace","stop":"s2.1","place":"p7"}. "move" and "add" always need "day" (a day number).
- "say" must match the actions exactly: never say you changed something you did not put in "actions". A place already in the trip cannot be added.
- A lighter or calmer day, or less walking: remove one or two of its least important sights, or replace far ones with near ones.
- Keep breakfast/lunch/dinner stops unless they ask about food; to change a meal, replace it with another eating place near it.
- Keep stops marked "asked" unless they ask to remove them. Add places to the day they are near. At most 6 actions.
- If they only ask a question, or nothing in the lists fits, give no actions and say so in "say" (for a place not in the lists, suggest searching it in the search bar).
"say": Hebrew, warm, at most 2 short sentences, speaking to them in plural (אתם, e.g. "שתיהנו", "ביקשתם"): what you changed and why, naming the places.
"chips": 3 short Hebrew suggestions (max 30 characters each) for their next change, specific to this trip and city now, each starting with an infinitive verb (e.g. "להוסיף גלידה בג'וליטי", "לקצר את יום 1").
Answer with one JSON object: {"say":"...","actions":[...],"chips":["...","...","..."]}`;
  const SHAPE = { type: "OBJECT", properties: {
    say: { type: "STRING" },
    actions: { type: "ARRAY", items: { type: "OBJECT", properties: { do: { type: "STRING", enum: ["remove", "move", "add", "replace"] }, stop: { type: "STRING" }, place: { type: "STRING" }, day: { type: "INTEGER" } }, required: ["do"] } },
    chips: { type: "ARRAY", items: { type: "STRING" } } }, required: ["say", "actions", "chips"], propertyOrdering: ["say", "actions", "chips"] };
  const short = n => String(n).slice(0, 48);
  function prompt(t, text, cands) {
    const days = t.days.map((d, di) => `Day ${di + 1} (${walk(d).toFixed(1)} km walking): ` + d.stops.map((s, i) =>
      `s${di + 1}.${i + 1} ${short(nameOf(s))} [${s.meal ? "meal:" + s.meal : s.kind || s.cat}${s.asked ? ",asked" : ""}]`).join("; ")).join("\n");
    const head = `City: ${t.cityEn || t.city}, ${t.country || ""}. ${t.days.length} days, moving by ${t.opts?.move || "walk"}.\nTHE TRIP:\n${days}\nTHE TRAVELER WROTE (Hebrew): """${String(text).slice(0, 300)}"""\nPLACES:\n`;
    // the places fill what is left of the message (the guide server keeps 6000 characters of it)
    let out = head, n = 0;
    for (let i = 0; i < cands.length; i++) {
      const line = `p${i + 1} ${short(nameOf(cands[i]))} [${cands[i].kind}, day ${nearestDay(t, cands[i]) + 1}]\n`;
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
    const touched = new Set(), used = new Set(), done = [];
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
      } else if (k === "replace" && st && p && !used.has(p.name) && st.s.meal !== "hotel") {
        const di = t.days.indexOf(st.d), i = st.d.stops.indexOf(st.s); if (i < 0) continue;
        U.replaceAt(di, i, p); used.add(p.name); touched.add(st.d); done.push({ c: "~", n: p.name });
      }
    }
    for (const d of touched) {
      if (!d.manualOrder) U.planner.optimizeDay(d);
      U.planner.assignTimes(d); d.route = null; d.legs = null;
    }
    return { touched: [...touched], done };
  }

  /* what changed, in plain words, when the guide did not say it */
  function describe(done) {
    const by = c => done.filter(x => x.c === c).map(x => x.n);
    const parts = [[by("-"), "הורדתי"], [by("+"), "הוספתי"], [by(">"), "העברתי ליום אחר"], [by("~"), "החלפתי ל"]].filter(([l]) => l.length).map(([l, w]) => `${w}${w.endsWith("ל") ? "" : ": "}${l.join(", ")}`);
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
      const { touched, done } = apply(t, r.actions, cands, text);
      const chips = (Array.isArray(r.chips) ? r.chips : []).map(c => String(c || "").replace(/<[^>]*>/g, "").replace(/[<>"`]/g, "").trim().slice(0, 34)).filter(Boolean).slice(0, 3);
      const idName = id => { const m = /^s(\d+)\.(\d+)$/.exec(id); if (m) return snapshot[+m[1] - 1]?.[+m[2] - 1] || ""; const k = /^p(\d+)$/.exec(id); return k ? cands[+k[1] - 1]?.name || "" : ""; };
      let say = String(r.say || "").replace(/[<>`]/g, "").replace(/\b([sp]\d+(?:\.\d+)?)\b/g, (x, id) => idName(id))
        .replace(/[^\u0000-\u024F\u0590-\u05FF\u2000-\u206F\u20AA]/gu, "").replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim().slice(0, 400);
      // it said it changed something but nothing it gave could be done: say that honestly
      if (!done.length && /(הוספ|הסר|הורד|העבר|החלפ|שינית|עדכנ)/.test(say)) say = "";
      Object.assign(A, { say: say || (done.length ? describe(done) : "לא מצאתי מה לשנות. נסו לכתוב את זה אחרת, או לשאול על מקום מסוים."), chips: chips.length ? chips : startChips(t).filter(c => c !== text), undo: done.length ? before : null });
      A.busy = false;
      if (done.length) { finish(t, touched); U.toast("המסלול עודכן"); } else refresh();
      return { say: A.say, acts: done.length ? [U.act("לבטל את השינוי", () => undo(U.S.trip))] : [] };
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

  window.Masa = window.Masa || {};
  window.Masa.agent = { install(u) { U = u; }, bar, bind, run, undo, chips: chipsOf, _state: A, _apply: apply, _candidates: candidates, _prompt: prompt, _system: SYSTEM };
})();
