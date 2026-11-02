/* מסע · a packing list made for this trip (loaded when it is opened, from the 'before the flight' folder).
   It reads what the site already knows: the forecast for the trip's days when there is one (else the season where
   the city is), how many days, who travels (children, a stroller or a wheelchair, Shabbat), what the route has (a
   beach, churches, a lot of walking, workouts) and the country's plugs. Ticks and added items stay on this device. */
(function () {
  "use strict";
  let U = null;
  const KEY = id => "masa-pack-" + id;
  const load = id => { try { return JSON.parse(localStorage.getItem(KEY(id)) || "{}"); } catch { return {}; } };
  const save = (id, v) => { try { localStorage.setItem(KEY(id), JSON.stringify(v)); } catch {} };

  /* the weather: the forecast for the trip's days, or the season where the city is */
  function weather(t) {
    const c = U.infoCache[`${t.lat},${t.lng}`];
    const { start } = U.tripDates(t);
    const days = (c?.weather || []).filter(d => d.date >= U.isoDate(start)).slice(0, t.days.length);
    if (days.length) {
      const lo = Math.min(...days.map(d => d.min)), hi = Math.max(...days.map(d => d.max)), rain = Math.max(...days.map(d => d.rain || 0));
      return { lo, hi, rain, from: "forecast" };
    }
    // no forecast yet: a rough season from the latitude and the month
    const lat = +t.lat || 0, m = start.getMonth(), south = lat < 0, a = Math.abs(lat);
    const summer = south ? [11, 0, 1].includes(m) : [5, 6, 7].includes(m), winter = south ? [5, 6, 7].includes(m) : [11, 0, 1].includes(m);
    if (a < 23) return { lo: 22, hi: 31, rain: 40, from: "season" };
    if (a > 50) return summer ? { lo: 12, hi: 22, rain: 40, from: "season" } : winter ? { lo: -3, hi: 5, rain: 40, from: "season" } : { lo: 5, hi: 14, rain: 40, from: "season" };
    return summer ? { lo: 19, hi: 31, rain: 15, from: "season" } : winter ? { lo: 3, hi: 12, rain: 35, from: "season" } : { lo: 10, hi: 21, rain: 30, from: "season" };
  }

  function items(t) {
    const w = weather(t), n = t.days.length, wish = t.wish || {}, kinds = new Set(t.days.flatMap(d => d.stops.map(s => s.kind)));
    const kids = !!wish.kids || /ילד|תינוק|פעוט/.test(t.opts?.notes || ""), stroller = t.opts?.mobility === "stroller", wheel = t.opts?.mobility === "wheelchair";
    const ci = U.countryInfo(t.cc), plug = ci?.plug || "";
    const needsAdapter = plug && !/\b[CEF]\b/.test(plug);
    const walk = U.totalWalk(t) / Math.max(1, n);
    const shirts = Math.min(n + 1, 7), cold = w.lo < 8, hot = w.hi >= 27, rainy = w.rain >= 40;
    const I = (cat, k, text, why) => ({ cat, k, text, why: why || "" });
    const L = [
      I("docs", "passport", "דרכון", "בתוקף לפחות חצי שנה אחרי החזרה"),
      I("docs", "tickets", "כרטיסי טיסה ואישורי הזמנה", "שמורים בטלפון וגם מודפסים"),
      I("docs", "insurance", "פוליסת ביטוח נסיעות"),
      I("docs", "cards", "כרטיס אשראי ומעט מזומן במטבע המקומי", ci?.curHe ? `המטבע: ${ci.curHe}` : ""),
      I("docs", "license", "רישיון נהיגה", t.opts?.move === "car" ? "ייתכן שצריך גם רישיון בינלאומי" : "")
    ].filter(x => x.k !== "license" || t.opts?.move === "car");
    L.push(
      I("clothes", "shirts", `${shirts} חולצות`, hot ? "קלות ומנדפות" : ""),
      I("clothes", "pants", cold ? `${Math.min(3, Math.ceil(n / 3) + 1)} מכנסיים ארוכים` : `${Math.min(4, Math.ceil(n / 2) + 1)} מכנסיים או חצאיות`),
      I("clothes", "under", `${n + 1} זוגות לבנים וגרביים`),
      I("clothes", "sleep", "פיג׳מה"),
      I("clothes", "shoes", "נעלי הליכה נוחות שכבר נעלתם", walk > 6 ? `כ-${walk.toFixed(0)} ק״מ הליכה ביום במסלול` : "")
    );
    if (cold) L.push(I("clothes", "coat", "מעיל חם", `${w.lo}° בבוקר`), I("clothes", "layers", "סוודר או פליז לשכבות"), I("clothes", "hat", "כובע צמר, צעיף וכפפות", w.lo <= 3 ? "קר מאוד" : ""));
    else if (w.lo < 16) L.push(I("clothes", "jacket", "ז׳קט קל או סוודר לערב", `${w.lo}° בערב`));
    if (hot) L.push(I("clothes", "sunhat", "כובע שמש ומשקפי שמש", `עד ${w.hi}°`));
    if (rainy) L.push(I("clothes", "rain", "מעיל גשם או מטרייה מתקפלת", w.from === "forecast" ? `עד ${w.rain}% גשם בתחזית` : "עונה עם גשם"));
    if (kinds.has("beach") || hot) L.push(I("clothes", "swim", "בגד ים ומגבת חוף", kinds.has("beach") ? "יש חוף במסלול" : ""));
    if (kinds.has("church") || ci?.extra) L.push(I("clothes", "cover", "בגד שמכסה כתפיים וברכיים", "לכניסה לכנסיות ולמקומות קדושים"));
    if (wish.fitness) L.push(I("clothes", "sport", "בגדי ספורט ונעלי ריצה", "ביקשתם להתאמן בטיול"));
    L.push(
      I("health", "meds", "תרופות קבועות, עם מרשם באנגלית"),
      I("health", "kit", "ערכת עזרה ראשונה קטנה", "משכך כאבים, פלסטרים, תרופה לבטן"),
      I("health", "toilet", "מברשת שיניים, משחה ומוצרי טיפוח", "בכבודת יד: נוזלים עד 100 מ״ל"),
      ...(hot || kinds.has("beach") ? [I("health", "sun", "קרם הגנה")] : []),
      ...(ci?.water && /לא|אין|מומלץ לשתות מים מבוקבקים|בקבוק/.test(ci.water) && !/ראויים/.test(ci.water) ? [I("health", "water", "בקבוק מים עם מסנן", "מי הברז לא מומלצים לשתייה")] : [I("health", "bottle", "בקבוק מים רב-פעמי", ci?.water ? "מי הברז ראויים לשתייה" : "")])
    );
    L.push(
      I("tech", "phone", "מטען לטלפון וסוללה ניידת", "הניווט והמסלול בטלפון כל היום"),
      ...(needsAdapter ? [I("tech", "adapter", `מתאם לשקע (סוג ${plug})`, "התקע הישראלי לא נכנס שם")] : [I("tech", "adapter", "מתאם לשקע, ליתר ביטחון", plug ? `השקעים שם: ${plug}` : "")]),
      I("tech", "esim", "eSIM או חבילת גלישה, מופעלת לפני הנחיתה"),
      I("tech", "offline", "המסלול שמור בטלפון לשימוש בלי אינטרנט", "פותחים אותו פעם אחת לפני הטיסה")
    );
    if (kids) L.push(
      I("kids", "snacks", "חטיפים ובקבוקי שתייה לילדים"),
      I("kids", "play", "משחקים, ספר או טאבלט עם אוזניות לטיסה"),
      I("kids", "kmeds", "תרופות לילדים (חום, כאבים, בחילה)"),
      I("kids", "spare", "בגדים להחלפה בתיק היד")
    );
    if (stroller) L.push(I("kids", "stroller", "עגלה קלה ומתקפלת, וכיסוי גשם לעגלה"));
    if (wheel) L.push(I("health", "wheel", "ערכת תיקון לכיסא ואישור רפואי לטיסה", "כדאי לתאם סיוע מראש עם חברת התעופה"));
    if (wish.shabbat || /כשר/.test(t.opts?.diet || "")) L.push(
      I("shabbat", "candles", "נרות שבת (נרות תה)", "בבתי מלון אסור לפעמים אש גלויה: אפשר נרות חשמליים"),
      I("shabbat", "kiddush", "יין או מיץ ענבים לקידוש, וחלות או לחמניות"),
      I("shabbat", "food", "אוכל כשר ארוז לימים בלי מסעדה כשרה"),
      I("shabbat", "keys", "מפתח מכני לחדר או לבקש מהמלון", "הרבה מלונות עם כרטיס מגנטי")
    );
    return { list: L, w };
  }
  const CATS = [["docs", "מסמכים וכסף"], ["clothes", "בגדים"], ["health", "בריאות וטיפוח"], ["tech", "טלפון ואלקטרוניקה"], ["kids", "לילדים"], ["shabbat", "לשבת"], ["mine", "שהוספתם"]];

  function view() {
    const t = U.S.trip, { esc, ic } = U, st = load(t.id), { list, w } = items(t);
    const mine = (st.mine || []).map((text, i) => ({ cat: "mine", k: "m" + i, text, why: "" }));
    const all = [...list, ...mine], done = all.filter(x => st[x.k]).length;
    const wtxt = w.from === "forecast" ? `לפי התחזית: ${w.lo}°–${w.hi}°${w.rain >= 40 ? ", ייתכן גשם" : ""}` : `לפי העונה: בערך ${w.lo}°–${w.hi}°. התחזית המדויקת מגיעה כשבועיים לפני.`;
    return `<div class="screen pack">
      <div class="topnav"><button class="iconbtn" id="backPack" aria-label="חזרה">${ic("back")}</button><span class="stepof">לפני הטיסה</span><span style="width:38px"></span></div>
      <div><h1>מה לארוז ל${esc(t.city)}</h1><p class="lead">${esc(wtxt)}</p></div>
      <div class="progress" aria-hidden="true"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div>
      <p class="muted" aria-live="polite">${done} מתוך ${all.length} ארוזים</p>
      ${CATS.map(([c, he]) => { const its = all.filter(x => x.cat === c); return its.length ? `<div class="card packcat"><h2>${esc(he)}</h2><ul class="checks">${its.map(x => `<li><label class="${st[x.k] ? "done" : ""}"><input type="checkbox" data-pk="${esc(x.k)}" ${st[x.k] ? "checked" : ""}><span>${esc(x.text)}${x.why ? `<small>${esc(x.why)}</small>` : ""}</span></label>${x.cat === "mine" ? `<button type="button" class="linkbtn" data-pdel="${x.k.slice(1)}" aria-label="להסיר את ${esc(x.text)}">הסרה</button>` : ""}</li>`).join("")}</ul></div>` : ""; }).join("")}
      <form class="keyrow" id="packAdd"><input id="packIn" class="select" maxlength="60" placeholder="להוסיף משהו לרשימה" aria-label="פריט להוספה לרשימה"><button class="btn small" type="submit">הוספה</button></form>
      <div class="disclaim">${ic("info")}<span>הרשימה נשמרת בדפדפן הזה. היא מתעדכנת לבד לפי התחזית, הנוסעים והמסלול.</span></div>
    </div>`;
  }
  function bind() {
    const t = U.S.trip;
    U.$("backPack").onclick = () => U.go("before", { noFly: true });
    document.querySelectorAll("[data-pk]").forEach(b => b.onchange = () => { const st = load(t.id); st[b.dataset.pk] = b.checked; save(t.id, st); U.rerenderKeepScroll(); });
    document.querySelectorAll("[data-pdel]").forEach(b => b.onclick = () => { const st = load(t.id), i = +b.dataset.pdel; (st.mine || []).splice(i, 1); for (const k of Object.keys(st)) if (/^m\d+$/.test(k)) delete st[k]; save(t.id, st); U.rerenderKeepScroll(); });
    U.$("packAdd").onsubmit = e => { e.preventDefault(); const v = U.$("packIn").value.trim().slice(0, 60); if (!v) return; const st = load(t.id); st.mine = [...(st.mine || []), v].slice(0, 40); save(t.id, st); U.rerenderKeepScroll(); };
  }
  window.Masa = window.Masa || {};
  window.Masa.pack = { install(u) { U = u; U.SCREENS.pack = { view, bind }; }, items: t => items(t) };
})();
