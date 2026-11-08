/* מסע · the settings screen and the account card.
   Loaded when the screen is first opened (see LAZY in app.js); sw.js keeps it for offline. */
(function () {
"use strict";
function install(u) {
const { S, SCREENS, $, esc, ic, go, rerenderKeepScroll, toast, store, ai, cloud, A11Y, applyA11y, STATS_KEY, statsOff, savedTrips, sendFeedback, TRIP_SCREENS, safeUrl, openAdmin } = u;
/* ---------- settings ---------- */
SCREENS.settings = {
  view() {
    const on = ai.enabled();
    return `<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backPrev" aria-label="חזרה">${ic("back")}</button><h1 style="font-size:1.5rem">הגדרות</h1><span style="width:38px"></span></div>
    ${accountCard()}
    <div class="card fbcard" id="fbCard"><h2>${ic("chat")} משהו לא עבד?</h2>
      <p class="lead">ספרו מה קרה או מה חסר לכם. זה מגיע ישר אלינו.</p>
      <textarea id="fbText" rows="3" maxlength="1500" placeholder="למשל: בבנייה של טיול לפראג המסך נתקע"></textarea>
      <input id="fbContact" type="text" class="select" maxlength="120" placeholder="מייל או טלפון, אם תרצו שנחזור אליכם (לא חובה)" autocomplete="email">
      <button type="button" class="btn" id="fbSend">שליחה</button>
      <div class="status" id="fbStatus" aria-live="polite"></div>
    </div>
    <div class="card"><h2>${ic("access")} נגישות ותצוגה</h2>
      <div class="section-label">גודל טקסט</div>
      <div class="seg" id="a11ySize">${[["100", "רגיל"], ["115", "גדול"], ["130", "גדול מאוד"]].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${A11Y.size === v}">${l}</button>`).join("")}</div>
      <label class="switchrow"><input type="checkbox" id="a11yHc" ${A11Y.hc ? "checked" : ""}><span>ניגודיות גבוהה וקווים עבים יותר</span></label>
      <label class="switchrow"><input type="checkbox" id="a11yMotion" ${A11Y.still ? "checked" : ""}><span>בלי אנימציות במפה</span></label>
      <label class="switchrow"><input type="checkbox" id="a11yLinks" ${A11Y.links ? "checked" : ""}><span>קו תחתון לכל הקישורים</span></label>
    </div>
    <div class="card"><h2>המדריך החכם <span class="tag ${on ? "free" : "book"}">${ai.shared() ? "פעיל לכולם" : on ? "פעיל" : "כבוי"}</span></h2>
      ${ai.shared() ? `<p>המדריך החכם פועל לכל מי שמשתמש במסע, בלי מפתח ובלי הרשמה: צ׳אט עם מדריך, סיפורים בעברית לכל מקום וטיפים אישיים.</p>
      <div class="disclaim">${ic("shield")}<span>השאלות שלכם עוברות דרך השרת של מסע אל Google Gemini, בלי שם ובלי פרטים מזהים, ולא נשמרות אצלנו. Google עשויה להשתמש בהן כדי לשפר את המודלים, אז לא כותבים למדריך פרטים אישיים.</span></div>
      <details class="ownkey"><summary>יש לכם מפתח Gemini משלכם? (לא חובה)</summary>` : ""}
      <p>בלי המדריך, מסע עובד עם מידע פתוח מ-OpenStreetMap ומוויקיפדיה. עם מפתח חינמי של Google Gemini מקבלים גם צ׳אט עם מדריך, סיפורים בעברית לכל מקום, טיפים אישיים ומנות מקומיות.</p>
      <ol class="howto">
        <li>נכנסים ל-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> עם חשבון גוגל.</li>
        <li>לוחצים על Create API key ומעתיקים את המפתח.</li>
        <li>מדביקים אותו כאן ולוחצים על שמירה.</li>
        <li>מומלץ: בהגדרות המפתח ב-Google Cloud מגבילים אותו לאתר הזה (Website restrictions), כדי שגם מי שישיג אותו לא יוכל להשתמש בו.</li>
      </ol>
      <form id="keyForm" class="keyrow"><input id="keyInput" type="password" placeholder="${on ? "מפתח חדש" : "AIza..."}" aria-label="מפתח Gemini" autocomplete="off" dir="ltr"><button class="btn" type="submit">שמירה</button></form>
      <div class="status ok" id="keyStatus">${ai.own() && ai.model() ? `מחובר. המודל: ${esc(ai.model())}` : ""}</div>
      ${ai.own() ? `<button type="button" class="btn small soft" id="keyDel">${ic("trash")}מחיקת המפתח</button>` : ""}
      <div class="disclaim">${ic("shield")}<span>המפתח נשמר רק בדפדפן הזה ונשלח רק ל-Google. בשכבה החינמית Google עשויה להשתמש בשאלות כדי לשפר את המודלים, אז לא כותבים למדריך פרטים אישיים.</span></div>
      ${ai.shared() ? "</details>" : ""}
    </div>
    <div class="card"><h2>${ic("info")} מאיפה המידע מגיע</h2>
      <ul class="etiq">
        <li>${ic("check")}<span>מפה ומקומות: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (רישיון ODbL)</span></li>
        <li>${ic("check")}<span>היסטוריה ותמונות: <a href="https://he.wikipedia.org" target="_blank" rel="noopener">ויקיפדיה</a> ו-Wikidata (רישיון CC BY-SA)</span></li>
        <li>${ic("check")}<span>מסלולי הליכה: שרת הניתוב של FOSSGIS (OSRM)</span></li>
        <li>${ic("check")}<span>עומסים: הערכה לפי סוג המקום, לא נתון חי</span></li>
      </ul></div>
    <div class="card"><h2>${ic("info")} תנאי שימוש ופרטיות</h2>
      <p class="lead"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a> · <a href="accessibility.html">הצהרת נגישות</a></p>
      <label class="switchrow"><input type="checkbox" id="statsOn" ${statsOff() ? "" : "checked"} ${navigator.doNotTrack === "1" ? "disabled" : ""}><span>לשלוח ספירה אנונימית (כמה טיולים נבנו ובאיזו עיר), כדי שנדע מה לשפר. בלי שם, בלי מזהה ובלי עוגיות.</span></label>
    </div>
    <div class="card"><h2>${ic("save")} נתונים שמורים</h2>
      <p class="lead">${savedTrips().length} טיולים שמורים בדפדפן הזה.</p>
      <button type="button" class="btn small soft" id="clearData">${ic("trash")}מחיקת הטיולים וההתקדמות</button>
      <div class="confirm" id="confirmClear" hidden><span>למחוק את כל הטיולים השמורים וסימוני ההזמנות?</span><button type="button" class="btn small coral" id="clearYes">כן, למחוק</button><button type="button" class="btn small soft" id="clearNo">ביטול</button></div>
    </div>
  </div>`;
  },
  bind() {
    $("statsOn") && ($("statsOn").onchange = e => store.set(STATS_KEY, !e.target.checked));
    $("fbSend") && ($("fbSend").onclick = async () => {
      const text = $("fbText").value.trim(), contact = $("fbContact").value.trim();
      if (text.length < 3) { $("fbStatus").textContent = "כתבו כמה מילים על מה שקרה."; $("fbText").focus(); return; }
      $("fbSend").disabled = true; $("fbStatus").textContent = "שולחים…";
      try { await sendFeedback(text, contact); $("fbText").value = ""; $("fbContact").value = ""; $("fbStatus").textContent = "תודה! קיבלנו."; toast("תודה! קיבלנו את ההודעה"); }
      catch { $("fbStatus").textContent = "לא הצלחנו לשלוח. בדקו את החיבור לאינטרנט ונסו שוב, או כתבו ל-Sivanmad7@gmail.com."; }
      finally { $("fbSend").disabled = false; }
    });
    if (S.openFeedback) { S.openFeedback = false; setTimeout(() => { $("fbCard")?.scrollIntoView({ block: "start" }); $("fbText")?.focus(); }, 50); }
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
    bindAccount();
    $("clearYes").onclick = () => { store.set("masa-trips", []); store.set("masa-checks", {}); u.clearChecks(); rerenderKeepScroll(); toast("הנתונים נמחקו"); };
  }
};
function accountCard() {
  if (!cloud.configured()) return "";
  const st = cloud.state, u = st.user;
  if (st.status === "in") return `<div class="card account"><h2>${u.photo ? `<img class="avatar" src="${esc(safeUrl(u.photo))}" alt="" referrerpolicy="no-referrer">` : ic("users")} ${esc(u.fullName || u.name || "החשבון שלי")}</h2>
      <p>הטיולים שלכם נשמרים בחשבון ומופיעים בכל מכשיר שמתחברים ממנו. ${u.email ? `<span class="muted">(${esc(u.email)})</span>` : ""}</p>
      <div class="chiprow"><button type="button" class="chipbtn" id="accOut">התנתקות</button><button type="button" class="chipbtn" id="accDel">${ic("trash")}מחיקת החשבון והמידע</button>${cloud.isOwner?.() ? `<button type="button" class="chipbtn" id="accAdmin">${ic("chart")}מסך מנהל</button>` : ""}</div>
      <div class="confirm" id="accDelAsk" hidden><span>למחוק את החשבון, את הטיולים שבחשבון ואת ההשתתפות בטיולים משותפים? בטיולים במכשיר הזה לא נוגעים.</span><button type="button" class="btn small coral" id="accDelYes">מחיקה</button><button type="button" class="btn small soft" id="accDelNo">ביטול</button></div></div>`;
  return `<div class="card account"><h2>${ic("users")} החשבון שלי</h2>
      <p>מתחברים עם Google כדי שהטיולים יישמרו גם אם מחליפים טלפון, יופיעו בכל מכשיר, ואפשר יהיה לתכנן טיול יחד עם המשפחה בזמן אמת.</p>
      <button type="button" class="btn block" id="accIn" ${st.status === "loading" ? "disabled" : ""}>${st.status === "loading" ? "מתחברים…" : "התחברות עם Google"}</button>
      <div class="disclaim">${ic("shield")}<span>נשמרים רק השם, התמונה והטיולים שלכם. אפשר למחוק הכול בכל רגע. <a href="privacy.html">מדיניות הפרטיות</a>, <a href="terms.html">תנאי השימוש</a></span></div></div>`;
}
function bindAccount() {
  $("accIn") && ($("accIn").onclick = () => cloud.signIn());
  $("accOut") && ($("accOut").onclick = async () => { await cloud.signOut(); toast("התנתקתם. הטיולים נשארו במכשיר."); rerenderKeepScroll(); });
  $("accDel") && ($("accDel").onclick = () => { $("accDelAsk").hidden = false; });
  $("accAdmin") && ($("accAdmin").onclick = openAdmin);
  $("accDelNo") && ($("accDelNo").onclick = () => { $("accDelAsk").hidden = true; });
  $("accDelYes") && ($("accDelYes").onclick = async () => {
    try { await cloud.deleteAccount(); toast("החשבון והמידע שבו נמחקו"); }
    catch (e) { toast(e.message === "relogin" ? "המידע נמחק. כדי למחוק גם את החשבון עצמו, התחברו שוב ולחצו על מחיקה." : "המחיקה לא הצליחה. נסו שוב."); }
    rerenderKeepScroll();
  });
}
}
window.Masa = window.Masa || {};
window.Masa.settings = { install };
})();
