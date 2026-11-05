/* מסע · the owner screen (loaded when opened, from the settings, only for the site's owner account).
   What travelers wrote in "something did not work?" and the anonymous counts: trips built, the sign-in step, shares,
   booking clicks, by day and by city. The automatic checks (the daily probe) are left out. Read through Firestore with
   the owner's sign-in; the rules (firestore.rules) let only her account read these. */
(function () {
  "use strict";
  let U = null;
  const st = { days: 7, ev: null, fb: null, err: "", loading: false };
  const NAMES = { build: "טיולים שנבנו", signin: "התחברויות", book: "לחיצות על הזמנה", flights: "חיפושי טיסות", share_link: "שיתוף בקישור", share_image: "שיתוף כתמונה", kit_open: "פתיחת מסך ההזמנות", guide_ai: "שאלות לסוכן", feedback: "משובים" };
  const isProbe = f => /^probe/.test(f.id) || f.screen === "probe";
  const day = d => d ? `${d.getDate()}.${d.getMonth() + 1}` : "";
  const time = d => d ? d.toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  async function load() {
    st.loading = true; st.err = ""; U.rerenderKeepScroll();
    try {
      const [ev, fb] = await Promise.all([U.cloud.ownerRead("events", st.days), U.cloud.ownerRead("feedback", Math.max(st.days, 30))]);
      st.ev = ev; st.fb = fb.filter(f => !isProbe(f)).sort((a, b) => (b.at || 0) - (a.at || 0));
    } catch (e) { st.err = /permission|insufficient/i.test(String(e?.message || e)) ? "אין הרשאה. צריך לפרסם את כללי האבטחה החדשים ב-Firebase." : "לא הצלחנו לטעון. בדקו את החיבור ונסו שוב."; }
    st.loading = false; U.rerenderKeepScroll();
  }
  const count = (e, f = () => true) => (st.ev || []).filter(x => x.e === e && f(x)).length;

  function view() {
    const { esc, ic } = U;
    const top = `<div class="topnav"><button class="iconbtn" id="backAdmin" aria-label="חזרה">${ic("back")}</button><h1 style="font-size:1.4rem">מסך מנהל</h1><span style="width:38px"></span></div>`;
    const seg = `<div class="seg" role="radiogroup" aria-label="תקופה">${[[1, "היום"], [7, "שבוע"], [30, "חודש"]].map(([d, l]) => `<button type="button" role="radio" data-days="${d}" aria-checked="${st.days === d}">${l}</button>`).join("")}</div>`;
    if (!st.ev) return `<div class="screen admin">${top}${seg}<p class="status" aria-live="polite">${st.err ? esc(st.err) : "טוענים…"}</p>${st.err ? `<button type="button" class="btn" id="adminRetry">לנסות שוב</button>` : ""}</div>`;
    const builds = (st.ev || []).filter(x => x.e === "build");
    // the sign-in step before the first trip: seen, tapped, and trips built
    const gateSeen = count("prompt_show", x => x.n === 3), gateTap = count("prompt_tap", x => x.n === 3), ins = count("signin");
    const cities = Object.entries(builds.reduce((m, x) => (m[x.city || "?"] = (m[x.city || "?"] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const brands = Object.entries((st.ev || []).filter(x => x.e === "book").reduce((m, x) => (m[x.city || "?"] = (m[x.city || "?"] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
    const days = []; for (let i = Math.min(st.days, 30) - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push({ d, n: builds.filter(x => x.at && x.at.toDateString() === d.toDateString()).length }); }
    const max = Math.max(1, ...days.map(x => x.n));
    const fbList = st.fb || [];
    return `<div class="screen admin">${top}${seg}
      ${st.loading ? `<p class="status">מעדכנים…</p>` : ""}
      <div class="admingrid">${Object.entries(NAMES).map(([k, he]) => `<div class="card adminstat"><b>${count(k)}</b><span>${he}</span></div>`).join("")}</div>
      <div class="card"><h2>${ic("shield")} מסך ההתחברות לפני טיול</h2>
        <p class="lead">${gateSeen} ראו אותו · ${gateTap} לחצו "התחברות" · ${ins} התחברו · ${builds.length} טיולים נבנו</p>
        ${gateSeen ? `<p class="muted">${Math.round(gateTap / gateSeen * 100)}% מאלה שראו את המסך לחצו להתחבר.</p>` : ""}</div>
      ${st.days > 1 ? `<div class="card"><h2>${ic("route")} טיולים לפי יום</h2><div class="adminbars" aria-label="טיולים שנבנו בכל יום">${days.map(x => `<span title="${day(x.d)}: ${x.n}"><i style="height:${Math.round(x.n / max * 100)}%"></i><small>${x.n || ""}</small></span>`).join("")}</div></div>` : ""}
      ${cities.length ? `<div class="card"><h2>${ic("pin")} הערים הכי מבוקשות</h2><ol class="adminlist">${cities.map(([c, n]) => `<li><span>${esc(c)}</span><b>${n}</b></li>`).join("")}</ol></div>` : ""}
      ${brands.length ? `<div class="card"><h2>${ic("ticket")} לחיצות על הזמנה לפי אתר</h2><ol class="adminlist">${brands.map(([c, n]) => `<li><span>${esc(c)}</span><b>${n}</b></li>`).join("")}</ol><p class="muted small">ההזמנות עצמן והעמלות מופיעות ב-Travelpayouts.</p></div>` : ""}
      <div class="card"><h2>${ic("chat")} משוב מהמשתמשים (${fbList.length})</h2>
        ${fbList.length ? `<ul class="adminfb">${fbList.map(f => `<li><p>${esc(f.text || "")}</p><small class="muted">${esc(time(f.at))}${f.screen ? ` · מסך: ${esc(f.screen)}` : ""}${f.city ? ` · ${esc(f.city)}` : ""}${f.contact ? ` · ליצירת קשר: ${esc(f.contact)}` : ""}</small><button type="button" class="linkbtn" data-fbdel="${esc(f.id)}">מחיקה</button></li>`).join("")}</ul>` : `<p class="muted">עוד אין משוב${st.days < 30 ? " בחודש האחרון" : ""}.</p>`}</div>
      <p class="muted small">הבדיקות האוטומטיות היומיות לא נספרות כאן. הספירות אנונימיות: בלי שמות ובלי מכשירים.</p>
    </div>`;
  }
  function bind() {
    U.$("backAdmin").onclick = () => U.go("settings");
    document.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { st.days = +b.dataset.days; st.ev = null; load(); });
    U.$("adminRetry") && (U.$("adminRetry").onclick = load);
    document.querySelectorAll("[data-fbdel]").forEach(b => b.onclick = async () => {
      try { await U.cloud.ownerDelete("feedback", b.dataset.fbdel); st.fb = st.fb.filter(f => f.id !== b.dataset.fbdel); U.rerenderKeepScroll(); U.toast("נמחק"); }
      catch { U.toast("לא הצלחנו למחוק. נסו שוב."); }
    });
    if (!st.ev && !st.loading && !st.err) load();
  }
  window.Masa = window.Masa || {};
  window.Masa.admin = { install(u) { U = u; U.SCREENS.admin = { view, bind }; }, reload: () => { st.ev = null; st.err = ""; } };
})();
