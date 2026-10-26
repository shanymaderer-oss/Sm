/* מסע · understanding what the traveler wrote in their own words.
   Works without any AI: Hebrew and English phrases are mapped to settings (diet, pace, budget, who is coming),
   to what to add or leave out, and to the names of places they want to see.
   Everything understood is shown back to the traveler, so nothing is guessed silently. */
window.Masa = window.Masa || {};
Masa.intent = (() => {
  const HE = "֐-׿";
  /* light normalizing: no niqqud or punctuation marks, one spelling for doubled letters (ותיקן = וותיקן) */
  const norm = s => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-֑ͯ-ׇ]/g, "")
    .replace(/[׳'`"״”“‘’]/g, "").replace(/[-–—_/\\]+/g, " ")
    .replace(/וו/g, "ו").replace(/יי/g, "י")
    .replace(/[^a-z0-9א-תÀ-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿 ]+/g, " ")
    .replace(/\s+/g, " ").trim();
  /* a Hebrew word with its little prefixes (ו ה ב ל מ ש כ) and any ending */
  const word = stem => new RegExp(`(?:^|[^${HE}a-z])(?:[ובלמהשכ]{0,3})${stem}`, "i");
  const NEG = /(?:^|\s)(?:ו?לא|ו?בלי|ללא|אין|פחות|בלי הרבה|שונא\S*|שונאת|מספיק עם|לא אוהב\S*|לא מתחבר\S*|לא רוצ\S*|לא מעניין\S*|לא צריך\S*|לא בא לנו|no|not|without|hate|avoid|skip|dont|don't|less)\s+(?:\S+\s+){0,2}$/i;

  /* each rule: test, what it means, and how it reads back to the traveler */
  const T = (re, on, off) => ({ re: Array.isArray(re) ? re : [re], on, off });
  const RULES = [
    // who is coming
    T([word("ילד"), word("ילדים"), word("תינוק"), word("פעוט"), word("משפחה"), word("משפחתי"), /\b(kids?|children|family|toddler|baby)\b/], { add: ["family"], kids: true, label: "עם ילדים: פארקים, גני חיות ופחות שעות במוזיאונים" }),
    T([word("עגל(?:ה|ת)"), word("טיולון"), /\bstroller|pram\b/], { mobility: "stroller", label: "עם עגלה: מקומות נגישים ופחות מדרגות" }),
    T([word("כיסא גלגלים"), word("כסא גלגלים"), word("נכה"), word("נגיש"), /\bwheelchair\b/], { mobility: "wheelchair", label: "כיסא גלגלים: מקומות נגישים בלבד כשאפשר" }),
    T([word("קש(?:ה|יים) ללכת"), word("פחות הליכה"), word("בלי הרבה הליכה"), word("מתקש\\S* (?:ב)?הליכה"), word("לא ללכת הרבה"), word("הליכה קצרה"), word("ברכיים"), word("סב(?:א|תא)(?=\\s|$)"), word("לא הרבה הליכה"), word("הורים מבוגרים"), word("אנשים מבוגרים"), word("קשישים"), word("גיל הזהב"), /\b(elderly|bad knees|can'?t walk much)\b/], { mobility: "walking", label: "פחות הליכה: תחנות קרובות יותר וזמני מנוחה" }),
    T([word("ירח דבש"), word("רומנטי"), word("יום נישואין"), word("זוגי"), /\b(honeymoon|romantic|anniversary)\b/], { romantic: true, boost: { view: 3, dessert: 2 }, label: "טיול זוגי: תצפיות, שקיעות וארוחת ערב טובה" }),
    // food and diet
    T([word("צמחוני"), word("טבעוני"), word("ויגן"), /\b(vegan|vegetarian|veggie)\b/], { diet: "צמחוני", label: "אוכל צמחוני" }),
    T([word("כשר"), word("כשרות"), /\bkosher\b/], { diet: "כשר", label: "אוכל כשר, ובית הכנסת הקרוב בכל יום" }),
    T([word("שומר\\S* שבת"), word("שבת"), /\bshabbat|sabbath\b/], { shabbat: true, label: "שומרים שבת: נסמן את השבת במסלול" }),
    T([word("אוכל(?!ים|ת)"), word("קולינרי"), word("לטעום"), word("טעימות"), word("מסעדות טובות"), word("פודי"), /\b(food|foodie|eat well|restaurants)\b/], { add: ["food"], label: "אוכל טוב בכל יום" }, { drop: ["food"], label: "פחות עצירות אוכל" }),
    T([word("אוכל מקומי"), word("אותנטי"), word("מקומי(?:ים|ות)?(?=\\s|$)"), /\b(local food|authentic)\b/], { local: true, label: "אוכל מקומי ואותנטי" }),
    T([word("אוכל רחוב"), /\bstreet food\b/], { add: ["food"], boost: { market: 4 }, cheapFood: true, label: "אוכל רחוב ושווקים" }),
    T([word("שו(?:ק|וקים)"), /\bmarkets?\b/], { add: ["food"], boost: { market: 5 }, label: "שווקים" }),
    T([word("גלידה"), word("קינוח"), word("מתוק"), word("עוגות"), word("שוקולד"), /\b(gelato|ice cream|dessert|sweets)\b/], { boost: { dessert: 4 }, label: "קינוחים וגלידה" }),
    T([word("בתי קפה"), word("בית קפה"), word("קפה טוב"), /\b(coffee|cafes?)\b/], { boost: { cafe: 3 }, label: "בתי קפה טובים" }),
    T([word("יין"), word("יקב"), /\bwine\b/], { wine: true, label: "ברים ליין" }),
    T([word("בשר"), word("סטייק"), /\b(meat|steak)\b/], { cuisine: ["steak", "grill", "barbecue", "bbq"], label: "בשרים" }, { diet: "צמחוני", label: "בלי בשר: אוכל צמחוני" }),
    // what interests them
    T([word("היסטורי"), word("היסטוריה"), word("עתיק"), word("ארכ(?:י)?אולוג"), word("חורבות"), word("ימי הביניים"), word("טיר(?:ה|ות)"), word("ארמו(?:ן|נות)"), /\b(history|historic|ancient|ruins|castles?|palaces?)\b/], { add: ["history"], label: "היסטוריה" }, { drop: ["history"], avoid: ["sight"], label: "פחות היסטוריה" }),
    T([word("מוזיאו"), word("אמנות"), word("אומנות"), word("גלרי"), word("ציורים"), /\b(museums?|art|galler(?:y|ies))\b/], { add: ["art"], label: "מוזיאונים ואמנות" }, { drop: ["art"], avoid: ["museum", "gallery"], label: "בלי מוזיאונים" }),
    T([word("כנסי(?:ה|ות|יה|יות)"), word("קתדרל"), word("מקדש"), /\b(churche?s?|cathedrals?|temples?)\b/], { boost: { church: 3 }, label: "כנסיות ומקדשים" }, { avoid: ["church"], label: "בלי כנסיות" }),
    T([word("בית כנסת"), word("בתי כנסת"), word("יהודי"), word("רובע היהודי"), /\b(synagogues?|jewish)\b/], { jewish: true, label: "מורשת יהודית: בתי כנסת והרובע היהודי" }),
    T([word("טבע(?!וני)"), word("פארק(?:ים)?(?!\\s*שעשועים)"), word("גנים"), word("ירוק"), word("אגם"), /\b(nature|parks?|gardens?)\b/], { add: ["nature"], label: "טבע ופארקים" }, { drop: ["nature"], label: "פחות פארקים" }),
    T([word("חו(?:ף|פים)"), /(?:^|\s)[ובלה]{0,2}ים(?=\s|$)/, /\bbeach(es)?\b/], { add: ["nature"], boost: { beach: 7 }, label: "חוף ים" }),
    T([word("חיי לילה"), word("ברים"), word("פאב"), word("מועדו"), word("מסיבות"), word("לבלות בלילה"), word("לצאת בלילה"), word("קוקטייל"), word("בירה"), /\b(nightlife|bars|clubs?|party|cocktails?|beer|pubs?)\b/], { add: ["night"], label: "בילוי בערב" }, { drop: ["night"], label: "בלי בילויי לילה" }),
    T([word("קניות"), word("שופינג"), word("לקנות"), /\bshopping\b/], { add: ["shopping"], label: "קניות: רחובות הקניות והשווקים" }, { drop: ["shopping"], avoid: ["street", "mall", "store", "shop"], label: "בלי קניות" }),
    T([word("קניו(?:ן|נים)"), word("אאוטלט"), word("מותגים"), word("חנויות"), word("חנות"), word("כלבו"), /\b(malls?|outlets?|shops|stores?|department store)\b/], { add: ["shopping"], stores: true, label: "קניות: גם קניונים וחנויות" }, { drop: ["shopping"], avoid: ["street", "mall", "store", "shop"], label: "בלי קניות" }),
    T([word("נו(?:ף|פים)"), word("תצפית"), word("לצלם"), word("צילום"), word("אינסטגרמ"), /\b(views?|photos?|instagram|viewpoints?)\b/], { add: ["view"], label: "תצפיות ומקומות לצילום" }),
    T([word("שקיע"), /\bsunsets?\b/], { add: ["view"], sunset: true, label: "שקיעה יפה בסוף היום" }),
    T([word("גג(?:ות)?(?=\\s|$)"), word("רופטופ"), /\brooftops?\b/], { rooftop: true, label: "ברים ומקומות על הגג" }),
    T([word("גן חיות"), word("אקווריום"), /\b(zoo|aquarium)\b/], { add: ["family"], boost: { zoo: 8 }, label: "גן חיות או אקווריום" }),
    T([word("פארק שעשועים"), word("לונה פארק"), word("דיסני"), /\b(theme park|disney|amusement)\b/], { add: ["family"], boost: { themepark: 8 }, label: "פארק שעשועים" }),
    T([word("פחות תיירים"), word("לא תיירותי"), word("פינות נסתרות"), word("מקומות סודיים"), word("כמו מקומיים"), word("הצד הפחות מוכר"), /\b(hidden gems?|off the beaten|less touristy|like locals?)\b/], { offbeat: true, label: "פחות תיירותי: גם פינות שהמקומיים אוהבים" }),
    T([word("הכי מפורסמים"), word("האטרקציות המרכזיות"), word("הקלאסיקות"), word("חובה"), word("הדברים המפורסמים"), /\b(must see|famous|highlights|top sights)\b/], { famous: true, label: "המקומות המפורסמים קודם" }),
    T([word("חינם"), word("בחינם"), /\bfree\b/], { free: true, budget: "חסכוני", label: "הרבה דברים בחינם" }),
    // pace, budget, moving around, time of day
    T([word("רגוע"), word("בנחת"), word("לא לחוץ"), word("לא להתאמץ"), word("לנוח"), word("מנוחה"), word("לאט(?=\\s|$)"), /\b(relaxed|slow|chill|easy)\b/], { pace: "רגוע", label: "קצב רגוע" }),
    T([word("אינטנסיבי"), word("כמה שיותר"), word("לראות הכ(?:ו)?ל"), word("מקסימום"), word("לא לבזבז זמן"), /\b(intense|packed|see everything|as much as)\b/], { pace: "אינטנסיבי", label: "קצב מלא: יותר תחנות ביום" }),
    T([word("זול"), word("חסכוני"), word("תקציב (?:נמוך|מוגבל|קטן)"), word("בלי להוציא הרבה"), word("סטודנט"), /\b(cheap|budget|low cost|students?)\b/], { budget: "חסכוני", label: "תקציב חסכוני" }),
    T([word("יוקר"), word("מפנק"), word("לפנק"), word("מישלן"), word("פיין דיינינג"), /\b(luxury|fancy|michelin|fine dining|splurge)\b/], { budget: "מפנק", label: "מפנקים: מסעדות טובות במיוחד" }),
    T([word("רכב(?!ת)"), word("אוטו"), word("שוכרים רכב"), /\b(car|rent a car|driving)\b/], { move: "car", label: "מתניידים ברכב" }),
    T([word("תחבורה ציבורית"), word("מטרו"), word("רכבת תחתית"), word("אוטובוס"), /\b(metro|subway|public transport|bus)\b/], { move: "transit", label: "תחבורה ציבורית" }),
    T([word("ברגל"), word("ללכת ברגל"), /\bon foot|walking\b/], { move: "walk", label: "הכול ברגל" }),
    T([word("קמים מאוחר"), word("לא מוקדם"), word("לישון עד מאוחר"), word("בלי השכמות"), /\b(sleep in|late start|not early)\b/], { start: 600, label: "מתחילים את היום ב-10:00" }),
    T([word("קמים מוקדם"), word("להתחיל מוקדם"), word("מוקדם בבוקר"), /\b(early start|early bird)\b/], { start: 480, label: "מתחילים את היום ב-8:00" })
  ];
  const CUISINES = [
    ["פיצה", "pizza", ["pizza"]], ["סושי", "sushi", ["sushi"]], ["ראמן", "ramen", ["ramen", "noodle"]], ["המבורגר", "burger", ["burger"]],
    ["איטלקי", "italian", ["italian", "pizza", "pasta"]], ["פסטה", "pasta", ["pasta", "italian"]], ["יפני", "japanese", ["japanese", "sushi", "ramen"]],
    ["תאילנדי", "thai", ["thai"]], ["הודי", "indian", ["indian"]], ["סיני", "chinese", ["chinese"]], ["מקסיקני", "mexican", ["mexican", "taco"]],
    ["טאפאס", "tapas", ["tapas", "spanish"]], ["פירות ים", "seafood", ["seafood", "fish"]], ["דגים", "fish", ["fish", "seafood"]],
    ["יווני", "greek", ["greek"]], ["צרפתי", "french", ["french"]], ["ספרדי", "spanish", ["spanish", "tapas"]], ["טורקי", "turkish", ["turkish", "kebab"]],
    ["וייטנאמי", "vietnamese", ["vietnamese"]], ["קוריאני", "korean", ["korean"]], ["ים תיכוני", "mediterranean", ["mediterranean", "greek", "lebanese"]],
    ["אסייתי", "asian", ["asian", "thai", "chinese", "japanese", "vietnamese"]], ["חומוס", "hummus", ["lebanese", "middle_eastern", "falafel"]]
  ];
  const CUISINE_HE = Object.fromEntries(CUISINES.map(([h, e]) => [e, h]));

  /* split into short clauses, so "בלי מוזיאונים, אבל אוהבים אוכל" negates only the museums */
  const clauses = text => String(text || "").split(/[.,;!?\n]|\s(?:אבל|אך|but)\s/i).map(s => s.trim()).filter(Boolean);
  function hit(clause, re) {
    const m = clause.match(re);
    if (!m) return null;
    const before = clause.slice(0, m.index + (m[0].match(/^[^א-תa-z]/i) ? 1 : 0));
    return { neg: NEG.test(before + " "), m: m[0] };
  }

  function parse(text) {
    const w = { add: new Set(), drop: new Set(), avoid: new Set(), boost: {}, likeCuisine: [], dislikeCuisine: [], labels: [], text: String(text || ""), ruleWords: new Set() };
    const used = m => norm(m).split(" ").forEach(x => { if (x.length >= 3) { w.ruleWords.add(x); w.ruleWords.add(x.replace(/^[ובלמהשכ]{1,2}/, "")); } });
    const say = l => { if (l && !w.labels.includes(l)) w.labels.push(l); };
    for (const c of clauses(text)) {
      const cn = c.toLowerCase();
      for (const r of RULES) {
        let found = null;
        for (const re of r.re) { found = hit(cn, re); if (found) break; }
        if (!found) continue;
        used(found.m);
        const eff = found.neg ? r.off : r.on;
        if (!eff) continue;
        (eff.add || []).forEach(x => { w.add.add(x); w.drop.delete(x); });
        (eff.drop || []).forEach(x => { w.drop.add(x); w.add.delete(x); });
        (eff.avoid || []).forEach(x => w.avoid.add(x));
        for (const [k, v] of Object.entries(eff.boost || {})) w.boost[k] = Math.max(w.boost[k] || 0, v);
        for (const k of ["diet", "mobility", "pace", "budget", "move", "start"]) if (eff[k] != null) w[k] = eff[k];
        for (const k of ["kids", "romantic", "shabbat", "local", "wine", "stores", "sunset", "rooftop", "offbeat", "famous", "free", "jewish", "cheapFood"]) if (eff[k]) w[k] = true;
        if (eff.cuisine) w.likeCuisine.push(...eff.cuisine);
        say(eff.label);
      }
      for (const [he, en, keys] of CUISINES) {
        const f = hit(cn, word(he)) || hit(cn, new RegExp(`\\b${en}\\b`));
        if (!f) continue;
        used(f.m);
        (f.neg ? w.dislikeCuisine : w.likeCuisine).push(...keys);
        say(f.neg ? `בלי ${he}` : `מסעדות: ${he}`);
      }
    }
    // numbers of people: "אנחנו 4", "משפחה של 5", "זוג"
    const ppl = w.text.match(/(?:אנחנו|משפחה של|קבוצה של|we are|family of)\s*(\d{1,2})/i) || w.text.match(/(\d{1,2})\s*(?:אנשים|מבוגרים|חברים|נפשות|people|adults)/i);
    // "2 מבוגרים ו-3 ילדים" is 5 travelers ("מבוגרים" here means adults, not elderly)
    const parts = [...w.text.matchAll(/(\d{1,2})\s*(?:מבוגרים|מבוגרות|ילדים|ילדות|נערים|תינוקות|adults|kids|children)/gi)].map(m => +m[1]);
    const sum = parts.length > 1 ? parts.reduce((a, b) => a + b, 0) : 0;
    if (sum >= 2 && sum <= 12) { w.people = sum; say(`${w.people} מטיילים`); }
    else if (ppl && +ppl[1] >= 1 && +ppl[1] <= 12) { w.people = +ppl[1]; say(`${w.people} מטיילים`); }
    else if (/(?:^|\s)(?:ו?זוג|אני ו(?:בעלי|אשתי|בן הזוג|בת הזוג|החבר|החברה))(?=\s|$)|\bcouple\b/i.test(w.text)) { w.people = 2; }
    const days = w.text.match(/(\d)\s*(?:ימים|days)/i);
    if (days && +days[1] >= 1 && +days[1] <= 5) { w.days = +days[1]; say(`${w.days} ימים`); }
    // a place they want, written after "לראות", "לבקר ב", "חייבים", "לא לפספס"
    w.asks = [];
    const ASK = /(?:רוצ\S* לראות|לראות את|חייבי\S*(?: לראות| לבקר ב| להגיע ל)?|לבקר ב|להגיע ל|לא לפספס(?: את)?|חובה(?: לראות)?|ללכת ל|לאכול ב|must see|want to see|visit)\s+([^,.;!?\n]{2,80})/gi;
    for (const m of w.text.matchAll(ASK)) {
      // "את מגדל אייפל ואת מונמארטר" is two places; stop at words that start a new thought
      const part = m[1].split(/\s+(?:כי|אבל|גם|ובערב|בערב|ביום|ואז|but|because)\s/)[0];
      for (let ph of part.split(/\s+(?:ו(?:גם\s+)?(?:את\s+)?(?=\S)|and\s+)/)) {
        ph = ph.trim().replace(/^(?:את|the)\s+/i, "");
        if (ph.length >= 2 && ph.split(/\s+/).length <= 4 && !w.asks.includes(ph)) w.asks.push(ph);
      }
    }
    // the hotel they already booked
    const h = w.text.match(/(?:גרים ב|ישנים ב|המלון שלנו(?: הוא)?|מלון|hotel|staying at)\s*[-:]?\s*([^,.;!?\n]{3,40})/i);
    if (h && !/^(זול|טוב|קרוב|במרכז|ליד|בלי|מומלץ|cheap|near|in the)/i.test(h[1].trim())) w.hotelName = h[1].trim().replace(/^(?:מלון|hotel)\s+/i, "");
    w.add = [...w.add]; w.drop = [...w.drop]; w.avoid = [...w.avoid];
    w.empty = !w.labels.length && !w.asks.length && !w.hotelName;
    return w;
  }

  /* ---------- finding the places they named ---------- */
  const GENERIC = new Set(("מוזיאון מוזיאוני כנסייה כנסיה כנסיית כנסית כיכר ככר גשר ארמון מגדל גן גני פארק שוק רחוב מבצר טירה טירת קתדרלה קתדרלת בזיליקה בזיליקת תיאטרון מסעדה " +
    "בית הקדוש הקדושה הקדושים סנט מרכז העיר העתיקה עתיקה הלאומי לאומי לאומית גלריה גלריית אמנות חוף נמל תחנה תחנת מקדש שער רובע אי הר נהר אגם מזרקה מזרקת אנדרטה אנדרטת קבר " +
    "של את עם על גם רוצים רוצה לראות חייבים לבקר אנחנו מאוד הרבה יום ימים בבוקר בערב טוב יפה ילדים אוכל מקום מקומות אתר מלון בית כנסת " +
    "the of and de la le del di da des du san santa st saint museum church cathedral basilica square plaza piazza place park garden bridge tower palace castle market street " +
    "gate hall house old new city national royal art gallery center centre station beach " +
    "hotel hostel gelato pizza pizzeria sushi coffee cafe caffe bar pub wine beer sunset view views kids family food shopping love like want see visit museums " +
    "trattoria osteria ristorante restaurant bistro gelateria bakery market roof rooftop terrace sky garden " +
    "פיצה סושי קפה גלידה בר יין בירה שקיעה נוף משפחה קניות חוף ים גג שוק מסעדות טבע פארקים " +
    "museu museo musee musees musei basilique basilica chiesa iglesia kirche kostel most ponte pont puente brucke placa praca namesti platz palazzo palais palacio schloss " +
    "castello chateau torre tour fontana fuente fontaine parc parco parque jardin giardino mercato mercado marche markt rua rue calle via carrer strasse ulice").split(" "));
  const PRE = "ובלמהשכ";
  const strip = w => {
    if (!/^[א-ת]/.test(w) || w.length < 4) return [w];
    const out = [w];
    if (PRE.includes(w[0]) && w.length - 1 >= 3) out.push(w.slice(1));
    if (PRE.includes(w[0]) && PRE.includes(w[1]) && w.length - 2 >= 3) out.push(w.slice(2));
    return out;
  };
  const lev1 = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  };
  const same = (a, b) => a === b || (a.length >= 6 && b.length >= 6 && lev1(a, b));
  const nameWords = (s, city) => {
    let n = norm(String(s || "").replace(/\s*\([^)]*\)\s*$/, ""));
    for (const c of city) if (c) n = n.replace(new RegExp(`\\s(?:ב|of |in )?${c}$`), "");
    return n.split(" ").filter(Boolean).map(w => /^[א-ת]/.test(w) && w.length > 3 ? w.replace(/^ה/, "") : w).filter(w => w.length >= 2);
  };
  /* items: [{names:[...], fame, ...}] ; returns matched items with the phrase that found them */
  function findPlaces(text, items, cityNames = [], opt = {}) {
    const skip = opt.skip || new Set();
    const city = cityNames.map(norm).filter(Boolean);
    const nt = norm(text);
    const toks = nt.split(" ").filter(Boolean);
    const variants = toks.map(t => strip(t));
    const has = w => variants.some(v => v.some(x => same(x, w)));
    // how many places use each word: a word that many places share is not a name
    const freq = new Map();
    const prepared = items.map(it => {
      const sets = it.names.filter(Boolean).map(n => nameWords(n, city)).filter(ws => ws.length);
      new Set(sets.flat()).forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
      return { it, sets };
    });
    const out = [];
    for (const { it, sets } of prepared) {
      let best = 0, by = "";
      for (const ws of sets) {
        const core = ws.filter(w => !GENERIC.has(w) && w.length >= 3);
        if (!core.length) continue;
        const matched = core.filter(has);
        // words that already told us a wish ("תחבורה ציבורית", "חוף ים") are not a place name on their own
        if (matched.length && matched.every(w => skip.has(w))) continue;
        // "Transport Museum" is not found by "transport" alone: a one-word name needs its kind written too, unless the place is very famous
        const gen = ws.filter(w => GENERIC.has(w) && w.length >= 3);
        if (core.length === 1 && matched.length === 1 && gen.length && !gen.some(has) && (it.fame || 0) < 40) continue;
        // a one-word name of a little-known place counts only when written exactly ("Da Enzo", not just "Enzo")
        if (core.length === 1 && (it.fame || 0) < 10 && !(` ${nt} `).includes(` ${ws.filter(w => !GENERIC.has(w)).join(" ")} `)) continue;
        // the whole name (all its telling words), or for long names most of them
        if (matched.length === core.length || (core.length >= 3 && matched.length >= core.length - 1)) {
          const sc = 10 + matched.join("").length + Math.min(8, (it.fame || 0) / 8) + (it.fame || 0) / 100 + (ws.filter(w => GENERIC.has(w) && has(w)).length * 2) - 3 * (core.length - matched.length);
          if (sc > best) { best = sc; by = ws.join(" "); }
        } else if (matched.length === 1 && !skip.has(matched[0]) && matched[0].length >= 5 && (freq.get(matched[0]) || 0) <= 2 && (it.fame || 0) >= 20) {
          // one rare word of a famous place ("ותיקן", "אקרופוליס")
          const sc = 4 + matched[0].length / 2 + (it.fame || 0) / 20;
          if (sc > best) { best = sc; by = ws.join(" "); }
        }
      }
      if (best) out.push({ it, score: best, by });
    }
    out.sort((a, b) => b.score - a.score);
    // one place per phrase: a famous place and its twins all match "Colosseum", keep the best one
    const taken = [];
    const kept = [];
    for (const o of out) {
      const words = o.by.split(" ").filter(w => !GENERIC.has(w));
      if (taken.some(t => words.every(w => t.includes(w)))) continue;
      taken.push(words);
      kept.push(o);
      if (kept.length >= 8) break;
    }
    return kept;
  }

  return { parse, findPlaces, norm, CUISINE_HE };
})();
