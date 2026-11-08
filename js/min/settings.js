(function(){"use strict";function m(f){const{S:i,SCREENS:k,$:t,esc:p,ic:e,go:v,rerenderKeepScroll:d,toast:o,store:b,ai:c,cloud:r,A11Y:n,applyA11y:u,STATS_KEY:y,statsOff:$,savedTrips:g,sendFeedback:w,TRIP_SCREENS:S,safeUrl:x,openAdmin:C}=f;k.settings={view(){const a=c.enabled();return`<div class="screen">
    <div class="topnav"><button class="iconbtn" id="backPrev" aria-label="חזרה">${e("back")}</button><h1 style="font-size:1.5rem">הגדרות</h1><span style="width:38px"></span></div>
    ${D()}
    <div class="card fbcard" id="fbCard"><h2>${e("chat")} משהו לא עבד?</h2>
      <p class="lead">ספרו מה קרה או מה חסר לכם. זה מגיע ישר אלינו.</p>
      <textarea id="fbText" rows="3" maxlength="1500" placeholder="למשל: בבנייה של טיול לפראג המסך נתקע"></textarea>
      <input id="fbContact" type="text" class="select" maxlength="120" placeholder="מייל או טלפון, אם תרצו שנחזור אליכם (לא חובה)" autocomplete="email">
      <button type="button" class="btn" id="fbSend">שליחה</button>
      <div class="status" id="fbStatus" aria-live="polite"></div>
    </div>
    <div class="card"><h2>${e("access")} נגישות ותצוגה</h2>
      <div class="section-label">גודל טקסט</div>
      <div class="seg" id="a11ySize">${[["100","רגיל"],["115","גדול"],["130","גדול מאוד"]].map(([s,l])=>`<button type="button" data-v="${s}" aria-pressed="${n.size===s}">${l}</button>`).join("")}</div>
      <label class="switchrow"><input type="checkbox" id="a11yHc" ${n.hc?"checked":""}><span>ניגודיות גבוהה וקווים עבים יותר</span></label>
      <label class="switchrow"><input type="checkbox" id="a11yMotion" ${n.still?"checked":""}><span>בלי אנימציות במפה</span></label>
      <label class="switchrow"><input type="checkbox" id="a11yLinks" ${n.links?"checked":""}><span>קו תחתון לכל הקישורים</span></label>
    </div>
    <div class="card"><h2>המדריך החכם <span class="tag ${a?"free":"book"}">${c.shared()?"פעיל לכולם":a?"פעיל":"כבוי"}</span></h2>
      ${c.shared()?`<p>המדריך החכם פועל לכל מי שמשתמש במסע, בלי מפתח ובלי הרשמה: צ׳אט עם מדריך, סיפורים בעברית לכל מקום וטיפים אישיים.</p>
      <div class="disclaim">${e("shield")}<span>השאלות שלכם עוברות דרך השרת של מסע אל Google Gemini, בלי שם ובלי פרטים מזהים, ולא נשמרות אצלנו. Google עשויה להשתמש בהן כדי לשפר את המודלים, אז לא כותבים למדריך פרטים אישיים.</span></div>
      <details class="ownkey"><summary>יש לכם מפתח Gemini משלכם? (לא חובה)</summary>`:""}
      <p>בלי המדריך, מסע עובד עם מידע פתוח מ-OpenStreetMap ומוויקיפדיה. עם מפתח חינמי של Google Gemini מקבלים גם צ׳אט עם מדריך, סיפורים בעברית לכל מקום, טיפים אישיים ומנות מקומיות.</p>
      <ol class="howto">
        <li>נכנסים ל-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> עם חשבון גוגל.</li>
        <li>לוחצים על Create API key ומעתיקים את המפתח.</li>
        <li>מדביקים אותו כאן ולוחצים על שמירה.</li>
        <li>מומלץ: בהגדרות המפתח ב-Google Cloud מגבילים אותו לאתר הזה (Website restrictions), כדי שגם מי שישיג אותו לא יוכל להשתמש בו.</li>
      </ol>
      <form id="keyForm" class="keyrow"><input id="keyInput" type="password" placeholder="${a?"מפתח חדש":"AIza..."}" aria-label="מפתח Gemini" autocomplete="off" dir="ltr"><button class="btn" type="submit">שמירה</button></form>
      <div class="status ok" id="keyStatus">${c.own()&&c.model()?`מחובר. המודל: ${p(c.model())}`:""}</div>
      ${c.own()?`<button type="button" class="btn small soft" id="keyDel">${e("trash")}מחיקת המפתח</button>`:""}
      <div class="disclaim">${e("shield")}<span>המפתח נשמר רק בדפדפן הזה ונשלח רק ל-Google. בשכבה החינמית Google עשויה להשתמש בשאלות כדי לשפר את המודלים, אז לא כותבים למדריך פרטים אישיים.</span></div>
      ${c.shared()?"</details>":""}
    </div>
    <div class="card"><h2>${e("info")} מאיפה המידע מגיע</h2>
      <ul class="etiq">
        <li>${e("check")}<span>מפה ומקומות: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (רישיון ODbL)</span></li>
        <li>${e("check")}<span>היסטוריה ותמונות: <a href="https://he.wikipedia.org" target="_blank" rel="noopener">ויקיפדיה</a> ו-Wikidata (רישיון CC BY-SA)</span></li>
        <li>${e("check")}<span>מסלולי הליכה: שרת הניתוב של FOSSGIS (OSRM)</span></li>
        <li>${e("check")}<span>עומסים: הערכה לפי סוג המקום, לא נתון חי</span></li>
      </ul></div>
    <div class="card"><h2>${e("info")} תנאי שימוש ופרטיות</h2>
      <p class="lead"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a> · <a href="accessibility.html">הצהרת נגישות</a></p>
      <label class="switchrow"><input type="checkbox" id="statsOn" ${$()?"":"checked"} ${navigator.doNotTrack==="1"?"disabled":""}><span>לשלוח ספירה אנונימית (כמה טיולים נבנו ובאיזו עיר), כדי שנדע מה לשפר. בלי שם, בלי מזהה ובלי עוגיות.</span></label>
    </div>
    <div class="card"><h2>${e("save")} נתונים שמורים</h2>
      <p class="lead">${g().length} טיולים שמורים בדפדפן הזה.</p>
      <button type="button" class="btn small soft" id="clearData">${e("trash")}מחיקת הטיולים וההתקדמות</button>
      <div class="confirm" id="confirmClear" hidden><span>למחוק את כל הטיולים השמורים וסימוני ההזמנות?</span><button type="button" class="btn small coral" id="clearYes">כן, למחוק</button><button type="button" class="btn small soft" id="clearNo">ביטול</button></div>
    </div>
  </div>`},bind(){t("statsOn")&&(t("statsOn").onchange=a=>b.set(y,!a.target.checked)),t("fbSend")&&(t("fbSend").onclick=async()=>{const a=t("fbText").value.trim(),s=t("fbContact").value.trim();if(a.length<3){t("fbStatus").textContent="כתבו כמה מילים על מה שקרה.",t("fbText").focus();return}t("fbSend").disabled=!0,t("fbStatus").textContent="שולחים…";try{await w(a,s),t("fbText").value="",t("fbContact").value="",t("fbStatus").textContent="תודה! קיבלנו.",o("תודה! קיבלנו את ההודעה")}catch{t("fbStatus").textContent="לא הצלחנו לשלוח. בדקו את החיבור לאינטרנט ונסו שוב, או כתבו ל-Sivanmad7@gmail.com."}finally{t("fbSend").disabled=!1}}),i.openFeedback&&(i.openFeedback=!1,setTimeout(()=>{t("fbCard")?.scrollIntoView({block:"start"}),t("fbText")?.focus()},50)),t("a11ySize").querySelectorAll("button").forEach(a=>a.onclick=()=>{n.size=a.dataset.v,u(),d()}),t("a11yHc").onchange=a=>{n.hc=a.target.checked,u()},t("a11yMotion").onchange=a=>{n.still=a.target.checked,u()},t("a11yLinks").onchange=a=>{n.links=a.target.checked,u()},t("backPrev").onclick=()=>v(i.prev&&i.prev!=="settings"&&(i.trip||!S.includes(i.prev))?i.prev:"home"),t("keyForm").onsubmit=async a=>{a.preventDefault();const s=t("keyInput").value.trim(),l=t("keyStatus");if(!s){l.className="status",l.textContent="הדביקו מפתח כדי לשמור.";return}l.className="status ok",l.textContent="בודקים את המפתח…";try{const h=await c.saveKey(s);d(),t("keyStatus").textContent=`מחובר. המודל: ${h}`,o("המדריך החכם הופעל")}catch(h){l.className="status",l.textContent=c.errText(h.code)}},t("keyDel")&&(t("keyDel").onclick=async()=>{await c.saveKey(""),d(),o("המפתח נמחק")}),t("clearData").onclick=()=>{t("confirmClear").hidden=!1},t("clearNo").onclick=()=>{t("confirmClear").hidden=!0},A(),t("clearYes").onclick=()=>{b.set("masa-trips",[]),b.set("masa-checks",{}),f.clearChecks(),d(),o("הנתונים נמחקו")}}};function D(){if(!r.configured())return"";const a=r.state,s=a.user;return a.status==="in"?`<div class="card account"><h2>${s.photo?`<img class="avatar" src="${p(x(s.photo))}" alt="" referrerpolicy="no-referrer">`:e("users")} ${p(s.fullName||s.name||"החשבון שלי")}</h2>
      <p>הטיולים שלכם נשמרים בחשבון ומופיעים בכל מכשיר שמתחברים ממנו. ${s.email?`<span class="muted">(${p(s.email)})</span>`:""}</p>
      <div class="chiprow"><button type="button" class="chipbtn" id="accOut">התנתקות</button><button type="button" class="chipbtn" id="accDel">${e("trash")}מחיקת החשבון והמידע</button>${r.isOwner?.()?`<button type="button" class="chipbtn" id="accAdmin">${e("chart")}מסך מנהל</button>`:""}</div>
      <div class="confirm" id="accDelAsk" hidden><span>למחוק את החשבון, את הטיולים שבחשבון ואת ההשתתפות בטיולים משותפים? בטיולים במכשיר הזה לא נוגעים.</span><button type="button" class="btn small coral" id="accDelYes">מחיקה</button><button type="button" class="btn small soft" id="accDelNo">ביטול</button></div></div>`:`<div class="card account"><h2>${e("users")} החשבון שלי</h2>
      <p>מתחברים עם Google כדי שהטיולים יישמרו גם אם מחליפים טלפון, יופיעו בכל מכשיר, ואפשר יהיה לתכנן טיול יחד עם המשפחה בזמן אמת.</p>
      <button type="button" class="btn block" id="accIn" ${a.status==="loading"?"disabled":""}>${a.status==="loading"?"מתחברים…":"התחברות עם Google"}</button>
      <div class="disclaim">${e("shield")}<span>נשמרים רק השם, התמונה והטיולים שלכם. אפשר למחוק הכול בכל רגע. <a href="privacy.html">מדיניות הפרטיות</a>, <a href="terms.html">תנאי השימוש</a></span></div></div>`}function A(){t("accIn")&&(t("accIn").onclick=()=>r.signIn()),t("accOut")&&(t("accOut").onclick=async()=>{await r.signOut(),o("התנתקתם. הטיולים נשארו במכשיר."),d()}),t("accDel")&&(t("accDel").onclick=()=>{t("accDelAsk").hidden=!1}),t("accAdmin")&&(t("accAdmin").onclick=C),t("accDelNo")&&(t("accDelNo").onclick=()=>{t("accDelAsk").hidden=!0}),t("accDelYes")&&(t("accDelYes").onclick=async()=>{try{await r.deleteAccount(),o("החשבון והמידע שבו נמחקו")}catch(a){o(a.message==="relogin"?"המידע נמחק. כדי למחוק גם את החשבון עצמו, התחברו שוב ולחצו על מחיקה.":"המחיקה לא הצליחה. נסו שוב.")}d()})}}window.Masa=window.Masa||{},window.Masa.settings={install:m}})();
