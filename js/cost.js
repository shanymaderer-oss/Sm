/* מסע · cost estimates.
   How much a meal, a night or a ticket usually costs, and what the whole trip will cost.
   All figures are rough estimates in euros (typical tourist prices), shown to the traveler as estimates.
   Real prices from Wikivoyage listings are used when they exist. */
window.Masa = window.Masa || {};
Masa.cost = (() => {
  /* typical prices per country, in euros:
     meal = dinner at a good mid-range restaurant, per person (main course + a drink)
     hotel = one mid-range double room (3–4 stars), per night
     move = public transport for one person, per day
     ticket = an average paid museum or site entry, per person */
  const COUNTRY = {
    it: { meal: 30, hotel: 150, move: 7, ticket: 18 }, fr: { meal: 35, hotel: 170, move: 9, ticket: 17 },
    es: { meal: 28, hotel: 140, move: 7, ticket: 16 }, pt: { meal: 22, hotel: 120, move: 6, ticket: 10 },
    de: { meal: 30, hotel: 125, move: 9, ticket: 14 }, at: { meal: 32, hotel: 140, move: 8, ticket: 18 },
    nl: { meal: 35, hotel: 180, move: 10, ticket: 20 }, gr: { meal: 22, hotel: 110, move: 5, ticket: 15 },
    cz: { meal: 18, hotel: 100, move: 5, ticket: 12 }, hu: { meal: 18, hotel: 95, move: 5, ticket: 12 },
    gb: { meal: 38, hotel: 200, move: 14, ticket: 18 }, us: { meal: 45, hotel: 250, move: 12, ticket: 28 },
    th: { meal: 12, hotel: 70, move: 5, ticket: 8 }, jp: { meal: 25, hotel: 140, move: 8, ticket: 10 },
    tr: { meal: 18, hotel: 95, move: 4, ticket: 25 }
  };
  /* other countries: price level compared with a typical western European city */
  const LEVEL = {
    ch: 1.6, no: 1.45, is: 1.5, dk: 1.4, se: 1.25, fi: 1.2, ie: 1.25, be: 1.05, lu: 1.15, mc: 1.8, mt: 0.9, cy: 0.9,
    pl: 0.65, hr: 0.85, si: 0.8, sk: 0.7, ro: 0.6, bg: 0.55, rs: 0.55, me: 0.65, al: 0.55, ba: 0.55, mk: 0.5, ee: 0.85, lv: 0.75, lt: 0.75,
    ge: 0.5, am: 0.5, ae: 1.3, qa: 1.3, eg: 0.35, ma: 0.45, tn: 0.4, jo: 0.75, in: 0.3, lk: 0.35, np: 0.3, vn: 0.3, id: 0.35, my: 0.45, ph: 0.4,
    sg: 1.35, hk: 1.25, kr: 0.85, cn: 0.6, tw: 0.65, mx: 0.55, br: 0.55, ar: 0.5, cl: 0.65, pe: 0.5, co: 0.45, ca: 1.15, au: 1.2, nz: 1.15, za: 0.5
  };
  const BASE = { meal: 30, hotel: 140, move: 8, ticket: 16 };
  /* the biggest tourist cities cost more than the rest of the country */
  const CITY = {
    paris: { hotel: 210, meal: 38 }, london: { hotel: 230 }, "new-york": { hotel: 300, meal: 50 }, amsterdam: { hotel: 210 }, venice: { hotel: 220, meal: 38 },
    florence: { hotel: 170 }, milan: { hotel: 170 }, rome: { hotel: 160 }, barcelona: { hotel: 160 }, madrid: { hotel: 140 }, lisbon: { hotel: 130 },
    porto: { hotel: 105 }, prague: { hotel: 100 }, budapest: { hotel: 95 }, vienna: { hotel: 140 }, berlin: { hotel: 125 }, athens: { hotel: 115 },
    bangkok: { hotel: 70 }, tokyo: { hotel: 150 }, istanbul: { hotel: 100 },
    dubai: { hotel: 170, meal: 40 }, copenhagen: { hotel: 190 }, dublin: { hotel: 200 }, edinburgh: { hotel: 170 }, nice: { hotel: 160 }, munich: { hotel: 150 },
    batumi: { hotel: 70 }, tbilisi: { hotel: 75 }, larnaca: { hotel: 110 }, limassol: { hotel: 140 }, paphos: { hotel: 110 }, naples: { hotel: 120, meal: 25 }
  };
  function base(cc, slug) {
    const b = COUNTRY[cc] || Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, v * (LEVEL[cc] || 1)]));
    return { ...b, ...(CITY[slug] || {}) };
  }

  /* ---------- reading prices written in Wikivoyage ("Mains €12–18", "1,500-3,000 yen") ---------- */
  const STATIC_EUR = { EUR: 1, GBP: 1.16, USD: 0.87, CZK: 0.041, HUF: 0.0025, THB: 0.026, JPY: 0.0058, TRY: 0.021, CHF: 1.07, PLN: 0.235, DKK: 0.134, SEK: 0.09, NOK: 0.085, ILS: 0.27, GEL: 0.32, AED: 0.235, RON: 0.2, RSD: 0.0085 };
  const SYMBOLS = [[/€|\beur\b|\beuros?\b/i, "EUR"], [/£|\bgbp\b/i, "GBP"], [/us\$|\$|\busd\b/i, "USD"], [/kč|\bczk\b/i, "CZK"], [/\bft\b|\bhuf\b|forint/i, "HUF"],
    [/฿|\bbaht\b|\bthb\b/i, "THB"], [/¥|\byen\b|\bjpy\b|円/i, "JPY"], [/₺|\btl\b|\btry\b|\blira\b/i, "TRY"], [/\bchf\b|\bfr\.?\s?\d/i, "CHF"], [/zł|\bpln\b/i, "PLN"], [/₾|\bgel\b|\blari\b/i, "GEL"], [/\baed\b|\bdhs?\b|dirham/i, "AED"], [/\blei\b|\bron\b/i, "RON"], [/\brsd\b|\bdin\b|dinar/i, "RSD"], [/\bdkk\b|\bkr\.?\s?\d|\d\s?kr\b/i, "DKK"]];
  const LOCAL_CUR = { ge: "GEL", ae: "AED", ro: "RON", rs: "RSD", gb: "GBP", us: "USD", cz: "CZK", hu: "HUF", th: "THB", jp: "JPY", tr: "TRY", ch: "CHF", pl: "PLN", dk: "DKK", se: "SEK", no: "NOK" };
  function num(s) {
    if (/^\d{1,3}([,.]\d{3})+$/.test(s)) return +s.replace(/[,.]/g, "");
    return +s.replace(",", ".");
  }
  /* Only numbers written next to a currency count ("€12–18", "40 Kč", "Ft1000"), so "3 dishes" or "4-bed dorm" are never read as prices.
     mode "food" ignores room prices, "room" prefers double-room prices. */
  const CUR_RX = "US\\$|€|£|\\$|¥|฿|₺|₾|zł|kč|ft|kr|lei|dhs?|aed|eur|euros?|gbp|usd|czk|huf|thb|jpy|try|pln|dkk|gel|ron|rsd|chf|yen|baht|lari|dinars?|forint";
  const NUM = "\\d[\\d.,]*";
  const BEFORE = new RegExp(`(${CUR_RX})\\s?(${NUM})(?:\\s?(?:-|–|—|to)\\s?(?:${CUR_RX})?\\s?(${NUM}))?`, "gi");
  const AFTER = new RegExp(`(${NUM})(?:\\s?(?:${CUR_RX})?\\s?(?:-|–|—|to)\\s?(${NUM}))?\\s?(${CUR_RX})(?![a-z])`, "gi");
  function curCode(sym, cc) {
    for (const [re, c] of SYMBOLS) if (re.test(sym) || re.test(sym + " 1")) return c;
    if (/^dinars?$/i.test(sym)) return "RSD";
    return LOCAL_CUR[cc] || "EUR";
  }
  const ROOMY = /(double|single|twin|room|dorm|bed\b|beds\b|night|b&b|suite|apartment|studio|per person per night)/i;
  const MAINS = /(main|secondi|primi|entr[ée]e|\bplat\b|\bdish\b|\bplate\b|pizza|burger|tapas|pasta)/i;
  const MENU = /(menu|tasting|per person|meal|lunch|dinner|average|buffet)/i;
  function parsePrice(text, cc, mode = "food") {
    if (!text) return null;
    const t = String(text).replace(/&euro;/g, "€").replace(/&pound;/g, "£").replace(/&nbsp;/g, " ");
    if (/^\s*(free|gratis|no charge)\b/i.test(t)) return { eur: 0, lo: 0, hi: 0, ctx: "free" };
    const found = [];
    const add = (sym, a, b, idx) => {
      const cur = curCode(sym, cc), r = STATIC_EUR[cur] || 1;
      const lo = num(a), hi = b ? num(b) : lo;
      if (!(lo > 0) || !isFinite(lo) || !isFinite(hi)) return;
      const before = t.slice(Math.max(0, idx - 28), idx);
      found.push({ lo: Math.min(lo, hi) * r, hi: Math.max(lo, hi) * r, before, idx });
    };
    let m;
    BEFORE.lastIndex = 0; while ((m = BEFORE.exec(t))) add(m[1], m[2], m[3], m.index);
    AFTER.lastIndex = 0; while ((m = AFTER.exec(t))) if (!found.some(f => Math.abs(f.idx - m.index) < 3)) add(m[3], m[1], m[2], m.index);
    if (!found.length) {
      // a short bare number ("15") is in the local currency
      if (t.length > 25) return null;
      const ns = (t.match(/\d[\d.,]*\d|\d/g) || []).map(num).filter(n => n > 0);
      if (!ns.length) return null;
      const r = STATIC_EUR[LOCAL_CUR[cc] || "EUR"] || 1;
      found.push({ lo: Math.min(...ns.slice(0, 2)) * r, hi: Math.max(...ns.slice(0, 2)) * r, before: "", idx: 0 });
    }
    let list = found, ctx = "generic";
    if (mode === "food") {
      list = found.filter(f => !ROOMY.test(f.before));
      if (!list.length) return null;
      const mains = list.filter(f => MAINS.test(f.before)), menus = list.filter(f => MENU.test(f.before));
      if (mains.length) { list = mains; ctx = "main"; } else if (menus.length) { list = menus; ctx = "menu"; }
    } else if (mode === "room") {
      const dbl = found.filter(f => /(double|twin|room|from)/i.test(f.before) && !/dorm/i.test(f.before));
      if (dbl.length) { list = dbl; ctx = "room"; }
    }
    // the middle of all the prices mentioned (a long menu lists cheap starters and expensive mains)
    const mids = list.map(f => (f.lo + f.hi) / 2).sort((a, b) => a - b);
    const h = mids.length >> 1;
    const eur = mids.length % 2 ? mids[h] : (mids[h - 1] + mids[h]) / 2;
    const lo = Math.min(...list.map(f => f.lo)), hi = Math.max(...list.map(f => f.hi));
    return { eur, lo: Math.max(lo, eur * 0.6), hi: Math.min(hi, eur * 1.6), ctx };
  }

  /* ---------- one place ---------- */
  const CLASS = { budget: 0.55, mid: 1, splurge: 2.2 };
  const KIND_MEAL = { restaurant: 1, cafe: 0.4, bakery: 0.25, dessert: 0.2, market: 0.6, deli: 0.45, bar: 0.6, club: 0.9 };
  const MEAL_PART = { breakfast: 0.45, lunch: 0.8, dinner: 1, treat: 1, drinks: 1 };
  const CHEAP = /pizza|kebab|burger|sandwich|fast_food|street|noodle|falafel|crepe|ramen|friture|fish_and_chips|chicken|bagel|hot_dog|empanada|taco|doner|souvlaki|gyros|bubble_tea/i;
  const SIMPLE = /trattoria|osteria|taverna|pizzeria|bistro|tapas|street|kebab|d[öo]ner|falafel|sandwich|snack|canteen|kantine|mensa|imbiss|bufet|taqueria|noodle|ramen/i;
  const r5 = v => v < 12 ? Math.max(1, Math.round(v)) : Math.round(v / 5) * 5;

  /* per person, for a meal or a drink */
  function perPerson(p, cc, slug, meal) {
    const b = base(cc, slug);
    const kindF = KIND_MEAL[p.kind] ?? 1;
    let eur = null, src = "est";
    const parsed = parsePrice(p.price, cc, "food");
    if (parsed && parsed.eur > 0 && p.kind === "restaurant") {
      // a main dish is about 70% of the bill (plus a drink, bread, service); a set menu is already the whole meal
      const v = parsed.eur * (parsed.ctx === "menu" ? 1.05 : parsed.ctx === "main" ? 1.7 : 1.3);
      if (v >= b.meal * 0.3 && v <= b.meal * 10) { eur = v; src = "wv"; }
    } else if (parsed && parsed.eur > 0 && ["bar", "club"].includes(p.kind)) {
      // a listed drink price: an evening is two or three drinks
      const v = parsed.eur < b.meal * 0.35 ? parsed.eur * 2.5 : parsed.eur;
      if (v <= b.meal * 3) { eur = v; src = "wv"; }
    } else if (parsed && parsed.eur >= 1 && p.kind !== "restaurant" && parsed.eur <= b.meal * Math.max(0.6, kindF) * 3) { eur = parsed.eur; src = "wv"; }
    if (eur == null) {
      let f = CLASS[p.priceClass] || 1;
      if (!p.priceClass && CHEAP.test(p.cuisine || "")) f = 0.6;
      else if (!p.priceClass && SIMPLE.test(p.local || p.name || "")) f = 0.8;
      if (p.mich) f = Math.max(f, 3 + p.mich);
      eur = b.meal * kindF * f;
      if (p.priceClass) src = "class";
    }
    if (p.mich) eur = Math.max(eur, b.meal * (2 + p.mich * 1.5)); // starred restaurants: the tasting menu is the meal
    eur *= p.kind === "restaurant" ? (MEAL_PART[meal] || 1) : 1;
    return { eur, lo: r5(eur * 0.8), hi: r5(eur * 1.25), src };
  }
  /* one room (or one hostel bed) per night */
  function night(p, cc, slug, budget) {
    const b = base(cc, slug);
    // a real price from Tripadvisor (one night, two adults, with taxes, in dollars): the best estimate there is
    if (p?.ta?.p) { const eur = p.ta.p * 0.87; return { eur, lo: r5(eur * 0.85), hi: r5(eur * 1.3), src: "ta" }; }
    const parsed = p && parsePrice(p.price, cc, p.kind === "hostel" ? "bed" : "room");
    if (parsed && parsed.eur >= 12 && parsed.eur <= b.hotel * 6) return { eur: parsed.eur, lo: r5(parsed.lo), hi: r5(parsed.hi), src: "wv", perBed: p.kind === "hostel" };
    let f;
    if (p?.kind === "hostel") return { eur: b.hotel * 0.28, lo: r5(b.hotel * 0.22), hi: r5(b.hotel * 0.35), src: "est", perBed: true };
    if (p?.stars) f = p.stars >= 5 ? 2.4 : p.stars >= 4 ? 1.25 : p.stars >= 3 ? 0.85 : 0.6;
    else if (p?.priceClass) f = CLASS[p.priceClass];
    else if (p?.kind === "guesthouse") f = 0.7;
    else if (p?.kind === "apartment") f = 0.95;
    else f = { "חסכוני": 0.6, "בינוני": 1, "מפנק": 2 }[budget] || 1;
    const eur = b.hotel * f;
    return { eur, lo: r5(eur * 0.8), hi: r5(eur * 1.3), src: p?.stars || p?.priceClass ? "class" : "est" };
  }
  /* entry ticket for a sight, per person */
  function ticket(s, cc, slug) {
    const b = base(cc, slug);
    if (s.fee === "no") return 0;
    const parsed = parsePrice(s.price, cc, "ticket");
    if (parsed && parsed.eur <= b.ticket * 5) return parsed.eur;
    if (/^(free|gratis|חינם|no)$/i.test(String(s.price || "").trim())) return 0;
    const k = s.kind;
    if (s.fee === "yes") return b.ticket * (k === "themepark" ? 3 : k === "zoo" ? 1.5 : 1);
    if (k === "museum") return b.ticket;
    if (k === "gallery") return b.ticket * 0.6;
    if (k === "zoo") return b.ticket * 1.5;
    if (k === "themepark") return b.ticket * 3;
    if ((k === "sight" || k === "attraction") && s.must) return b.ticket * 0.8;
    if (k === "sight" || k === "attraction") return b.ticket * 0.25;
    return 0;
  }

  /* ---------- the whole trip ---------- */
  function trip(t) {
    const cc = t.cc, slug = t.slug || cityslug(t), o = t.opts || {};
    const people = Math.max(1, o.people || 2), days = t.days.length;
    const b = base(cc, slug);
    const nights = Math.max(1, days - (days > 2 ? 1 : 0));
    const rooms = Math.ceil(people / 2);
    let food = 0, tickets = 0, ticketCount = 0;
    const meals = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const d of t.days) {
      const has = new Set();
      for (const s of d.stops) {
        if (s.isHotel || s.meal === "hotel") continue;
        if (s.meal || s.cat === "food" || s.cat === "night") {
          const m = perPerson(s, cc, slug, s.meal || null).eur;
          food += m;
          if (s.meal && meals[s.meal] != null) has.add(s.meal);
        } else {
          const tk = ticket(s, cc, slug);
          if (tk > 0) { tickets += tk; ticketCount++; }
        }
      }
      // meals the plan didn't place still cost money: a simple breakfast and lunch every day
      const bf = { "חסכוני": 0.75, "בינוני": 1, "מפנק": 1.4 }[o.budget] || 1;
      if (!has.has("breakfast")) food += b.meal * 0.3 * bf;
      if (!has.has("lunch")) food += b.meal * 0.6 * bf;
      if (!has.has("dinner")) food += b.meal * 0.9 * bf;
      food += b.meal * 0.15 * bf; // water, coffee and snacks along the way
    }
    const h = t.hotel ? night(t.hotel, cc, slug, o.budget) : night(null, cc, slug, o.budget);
    const sleepTotal = h.perBed ? h.eur * people * nights : h.eur * rooms * nights;
    // by car: rental, fuel and parking for each car (5 people a car); otherwise public transport for each traveler
    const cars = Math.ceil(people / 5);
    const byCar = o.move === "car";
    const move = byCar ? (b.hotel * 0.35 + b.meal * 0.9) * days * cars : b.move * days * people * (o.move === "walk" ? 0.6 : 1);
    const foodAll = food * people, ticketsAll = tickets * people;
    const sub = sleepTotal + foodAll + ticketsAll + move;
    const extra = sub * 0.08;
    const total = sub + extra;
    return {
      total, perPerson: total / people, perDay: total / days, people, days, nights, rooms,
      rows: [
        { k: "sleep", he: "לינה", eur: sleepTotal, note: `${nights} ${nights === 1 ? "לילה" : "לילות"} · ${h.perBed ? `${people} מיטות` : `${rooms} ${rooms === 1 ? "חדר" : "חדרים"}`}${t.hotel ? ` · ${t.hotel.name}` : ` · ${{ "חסכוני": "מלון פשוט", "בינוני": "מלון 3–4 כוכבים", "מפנק": "מלון יוקרה" }[o.budget] || "מלון 3–4 כוכבים"}`}` },
        { k: "food", he: "אוכל ושתייה", eur: foodAll, note: `כל הארוחות במסלול, לפי המחיר של כל מקום` },
        { k: "tickets", he: "כניסות לאתרים", eur: ticketsAll, note: ticketCount ? `${ticketCount} מקומות בתשלום במסלול` : "רוב המקומות במסלול בחינם" },
        { k: "move", he: byCar ? "רכב" : "תחבורה בעיר", eur: move, note: byCar ? `השכרה, דלק וחניה ל-${cars === 1 ? "רכב אחד" : cars + " רכבים"}` : o.move === "walk" ? "רוב הדרך ברגל, ולפעמים נסיעה" : "תחבורה ציבורית, בערך כרטיס יומי" },
        { k: "extra", he: "שונות", eur: extra, note: "טיפים, מים, הפתעות" }
      ]
    };
  }
  function cityslug(t) {
    const c = Masa.cities?.findCity?.(t.cityEn || t.cityLocal || t.city);
    return c && Masa.planner?.km?.(c, t) < 20 ? c.slug : null;
  }

  /* ---------- money in shekels ---------- */
  const FX = { eurILS: 3.5, curILS: null, cur: "EUR", live: false };
  const fxLoading = {};
  async function loadFX(cur) {
    const key = cur || "EUR";
    if (fxLoading[key]) return fxLoading[key];
    fxLoading[key] = (async () => {
      const e = await Masa.svc.rateToILS("EUR");
      if (e?.rate) { FX.eurILS = e.rate; FX.live = true; }
      if (cur && cur !== "EUR") {
        const c = await Masa.svc.rateToILS(cur);
        FX.cur = cur; FX.curILS = c?.rate || (STATIC_EUR[cur] ? STATIC_EUR[cur] * FX.eurILS : null);
      } else { FX.cur = "EUR"; FX.curILS = FX.eurILS; }
      return FX;
    })();
    return fxLoading[key];
  }
  const roundILS = v => v >= 2000 ? Math.round(v / 100) * 100 : v >= 300 ? Math.round(v / 10) * 10 : v >= 10 ? Math.round(v / 5) * 5 : Math.round(v);
  const fmtNum = v => Math.round(v).toLocaleString("en-US");
  const ils = eur => `₪${fmtNum(roundILS(eur * FX.eurILS))}`;
  const ilsRange = (lo, hi) => { const a = roundILS(lo * FX.eurILS), b = roundILS(hi * FX.eurILS); return a === b ? `₪${fmtNum(a)}` : `₪${fmtNum(a)}–${fmtNum(b)}`; };
  const SIGN = { GEL: "₾", AED: "AED", RON: "lei", RSD: "RSD", DKK: "kr", EUR: "€", GBP: "£", USD: "$", JPY: "¥", THB: "฿", TRY: "₺", CZK: "Kč", HUF: "Ft", CHF: "CHF", PLN: "zł" };
  function local(eur, cur) {
    cur = cur || "EUR";
    let v;
    if (cur === "EUR") v = eur;
    else if (FX.cur === cur && FX.curILS) v = eur * FX.eurILS / FX.curILS;
    else if (STATIC_EUR[cur]) v = eur / STATIC_EUR[cur];
    else return "";
    const r = v >= 1000 ? Math.round(v / 100) * 100 : v >= 100 ? Math.round(v / 10) * 10 : Math.round(v);
    const s = SIGN[cur] || cur;
    return ["EUR", "GBP", "USD"].includes(cur) ? `${s}${fmtNum(r)}` : `${fmtNum(r)} ${s}`;
  }
  function localRange(lo, hi, cur) {
    const a = local(lo, cur), b = local(hi, cur);
    if (!a) return "";
    if (a === b) return a;
    const nb = b.replace(/[^\d,]/g, "");
    return ["EUR", "GBP", "USD"].includes(cur || "EUR") ? `${a}–${nb}` : a.replace(/^([\d,]+)/, `$1–${nb}`);
  }
  return { base, parsePrice, perPerson, night, ticket, trip, loadFX, FX, ils, ilsRange, local, localRange };
})();
