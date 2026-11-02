/* מסע · what the trip costs as it happens (loaded when opened, from the 'together' folder).
   Each expense is written in the local currency or in shekels, with a kind and a day; the totals show in both,
   by kind, by day and per traveler. Kept with the trip on this device (not shared in the trip's link). */
(function () {
  "use strict";
  let U = null;
  const KINDS = [["food", "אוכל"], ["move", "תחבורה"], ["tickets", "כניסות"], ["shop", "קניות"], ["sleep", "לינה"], ["other", "אחר"]];
  const KHE = Object.fromEntries(KINDS);
  const money = (v, cur) => { try { return new Intl.NumberFormat("he-IL", { style: "currency", currency: cur, maximumFractionDigits: v >= 100 ? 0 : 2 }).format(v); } catch { return `${Math.round(v)} ${cur}`; } };
  const st = { cur: "local", kind: "food" };

  function rate(cur) {
    // shekels for one unit of the local currency: today's rate when it loaded, else the built-in one
    const F = U.COST.FX;
    if (cur === "ILS") return 1;
    if (cur === "EUR") return F.eurILS;
    if (F.cur === cur && F.curILS) return F.curILS;
    return null;
  }
  function todayIdx(t) {
    const { start } = U.tripDates(t), d = Math.floor((Date.now() - start) / 864e5);
    return d >= 0 && d < t.days.length ? d : 0;
  }

  function view() {
    const t = U.S.trip, { esc, ic } = U, cur = U.COUNTRY_CUR[t.cc] || "EUR", r = rate(cur), list = t.spend || [];
    const people = Math.max(1, t.opts?.people || 2);
    const total = list.reduce((a, x) => a + x.ils, 0);
    const byKind = KINDS.map(([k, he]) => ({ k, he, v: list.filter(x => x.kind === k).reduce((a, x) => a + x.ils, 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const byDay = t.days.map((d, i) => ({ i, label: d.label, v: list.filter(x => x.day === i).reduce((a, x) => a + x.ils, 0) })).filter(x => x.v > 0);
    const loc = v => r && cur !== "ILS" ? ` <small>(${money(v / r, cur)})</small>` : "";
    const day0 = st.day ?? todayIdx(t);
    return `<div class="screen spend">
      <div class="topnav"><button class="iconbtn" id="backSpend" aria-label="חזרה">${ic("back")}</button><span class="stepof">ביחד</span><span style="width:38px"></span></div>
      <div><h1>הוצאות הטיול</h1><p class="lead">רושמים כל הוצאה, ורואים כמה יצא עד עכשיו${cur !== "ILS" ? `, בשקלים וב${esc(curHe(cur))}` : ""}.</p></div>
      <div class="card spendtotal"><span class="eyebrow">עד עכשיו</span><b>${money(total, "ILS")}</b>${loc(total)}
        ${list.length ? `<p class="muted">${money(total / people, "ILS")} לאדם · ${list.length} הוצאות</p>` : ""}</div>
      <form class="card spendform" id="spendForm">
        <h2>${ic("plus")} הוצאה חדשה</h2>
        <div class="spendrow"><input id="spAmt" type="text" inputmode="decimal" autocomplete="off" placeholder="סכום" aria-label="סכום">
          <div class="seg" role="radiogroup" aria-label="מטבע">${cur !== "ILS" ? `<button type="button" role="radio" data-cur="local" aria-checked="${st.cur === "local"}">${esc(cur)}</button>` : ""}<button type="button" role="radio" data-cur="ILS" aria-checked="${st.cur === "ILS" || cur === "ILS"}">₪</button></div></div>
        <div class="chiprow" role="radiogroup" aria-label="סוג ההוצאה">${KINDS.map(([k, he]) => `<button type="button" class="chipbtn" role="radio" data-kind="${k}" aria-checked="${st.kind === k}">${he}</button>`).join("")}</div>
        <div class="spendrow"><select id="spDay" class="select" aria-label="יום">${t.days.map((d, i) => `<option value="${i}" ${i === day0 ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select>
          <input id="spNote" class="select" maxlength="40" placeholder="על מה? (לא חובה)" aria-label="על מה"></div>
        <button class="btn block" type="submit">הוספה</button>
        <p class="status" id="spStatus" aria-live="polite"></p>
      </form>
      ${byKind.length ? `<div class="card"><h2>לפי סוג</h2>${byKind.map(x => `<div class="spendbar"><span>${esc(x.he)}</span><i style="width:${Math.max(4, x.v / total * 100)}%"></i><b>${money(x.v, "ILS")}</b></div>`).join("")}</div>` : ""}
      ${byDay.length > 1 ? `<div class="card"><h2>לפי יום</h2>${byDay.map(x => `<div class="spendbar"><span>${esc(x.label)}</span><i style="width:${Math.max(4, x.v / total * 100)}%"></i><b>${money(x.v, "ILS")}</b></div>`).join("")}</div>` : ""}
      ${list.length ? `<div class="card"><h2>כל ההוצאות</h2><ul class="spendlist">${[...list].reverse().map(x => `<li><span><b>${money(x.amt, x.cur)}</b> · ${esc(KHE[x.kind] || "")}${x.note ? ` · ${esc(x.note)}` : ""}<small>${esc(t.days[x.day]?.label || "")}${x.cur !== "ILS" ? ` · ${money(x.ils, "ILS")}` : ""}</small></span><button type="button" class="linkbtn" data-sdel="${esc(x.id)}" aria-label="למחוק את ההוצאה">מחיקה</button></li>`).join("")}</ul></div>` : ""}
      <div class="disclaim">${ic("info")}<span>ההוצאות נשמרות עם הטיול בדפדפן הזה ולא נשלחות לאף אחד. ההמרה לשקלים לפי השער ביום ההוספה.</span></div>
    </div>`;
  }
  const curHe = c => ({ EUR: "יורו", USD: "דולר", GBP: "לירות", JPY: "ין", THB: "באט", CZK: "קורונות", HUF: "פורינט", TRY: "לירות טורקיות", CHF: "פרנקים", PLN: "זלוטי" })[c] || c;

  function bind() {
    const t = U.S.trip, cur = U.COUNTRY_CUR[t.cc] || "EUR";
    U.$("backSpend").onclick = () => U.go("together", { noFly: true });
    document.querySelectorAll("[data-cur]").forEach(b => b.onclick = () => { st.cur = b.dataset.cur; document.querySelectorAll("[data-cur]").forEach(x => x.setAttribute("aria-checked", x === b)); });
    document.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { st.kind = b.dataset.kind; document.querySelectorAll("[data-kind]").forEach(x => x.setAttribute("aria-checked", x === b)); });
    U.$("spDay").onchange = e => { st.day = +e.target.value; };
    U.$("spendForm").onsubmit = e => {
      e.preventDefault();
      const amt = parseFloat(String(U.$("spAmt").value).replace(/[^\d.,]/g, "").replace(",", "."));
      if (!(amt > 0 && amt < 1e7)) { U.$("spStatus").textContent = "כתבו סכום, למשל 12.5"; U.$("spAmt").focus(); return; }
      const c = st.cur === "ILS" || cur === "ILS" ? "ILS" : cur, r = rate(c);
      if (!r) { U.$("spStatus").textContent = "אין לנו עכשיו שער המרה. נסו בשקלים, או שוב כשיש אינטרנט."; return; }
      t.spend = [...(t.spend || []), { id: "s" + Date.now().toString(36), amt: Math.round(amt * 100) / 100, cur: c, ils: Math.round(amt * r * 100) / 100, kind: st.kind, day: +U.$("spDay").value, note: U.$("spNote").value.trim().slice(0, 40), at: Date.now() }].slice(-500);
      st.day = +U.$("spDay").value;
      U.saveTrip(t); U.rerenderKeepScroll(); U.toast("ההוצאה נרשמה");
    };
    document.querySelectorAll("[data-sdel]").forEach(b => b.onclick = () => { t.spend = (t.spend || []).filter(x => x.id !== b.dataset.sdel); U.saveTrip(t); U.rerenderKeepScroll(); });
  }
  window.Masa = window.Masa || {};
  window.Masa.spend = { install(u) { U = u; U.SCREENS.spend = { view, bind }; } };
})();
