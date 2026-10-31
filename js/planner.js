/* מסע · trip planner.
   Builds each day from what the traveler chose: restaurants and cafés ranked by quality signals and budget,
   malls and markets, nightlife, and sights only from the categories they picked.
   Data: OpenStreetMap + Wikivoyage recommendations + Wikipedia. The optional AI adds stories on top. */
window.Masa = window.Masa || {};
Masa.planner = (() => {
  const { CATS, PHRASES, COUNTRY_LANG, ETIQUETTE_GENERIC } = window.MASA_DATA;
  const svc = Masa.svc, SRC = Masa.sources, CITIES = Masa.cities;
  const hasXY = p => p && p.lat != null && p.lng != null && isFinite(+p.lat) && isFinite(+p.lng);

  const km = (a, b) => {
    const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  /* ---------- place kinds ---------- */
  /* kind = what the place is; cat = which interest it serves (colors and icons) */
  const KIND = {
    restaurant: { cat: "food", he: "מסעדה", min: 75 }, cafe: { cat: "food", he: "בית קפה", min: 45 }, dessert: { cat: "food", he: "קינוח", min: 30 },
    bakery: { cat: "food", he: "מאפייה", min: 25 }, market: { cat: "food", he: "שוק", min: 60 }, deli: { cat: "food", he: "מעדנייה", min: 30 },
    bar: { cat: "night", he: "בר", min: 90 }, club: { cat: "night", he: "מועדון", min: 120 },
    street: { cat: "shopping", he: "רחוב קניות", min: 75 }, mall: { cat: "shopping", he: "קניון", min: 90 }, shop: { cat: "shopping", he: "חנות", min: 40 }, store: { cat: "shopping", he: "כלבו", min: 60 },
    museum: { cat: "art", he: "מוזיאון", min: 110 }, gallery: { cat: "art", he: "גלריה", min: 60 },
    sight: { cat: "history", he: "אתר היסטורי", min: 70 }, square: { cat: "history", he: "כיכר", min: 35 }, bridge: { cat: "view", he: "גשר", min: 30 }, church: { cat: "history", he: "מבנה דתי", min: 40 },
    view: { cat: "view", he: "תצפית", min: 35 }, attraction: { cat: "view", he: "אטרקציה", min: 60 },
    park: { cat: "nature", he: "פארק", min: 60 }, beach: { cat: "nature", he: "חוף", min: 120 },
    zoo: { cat: "family", he: "גן חיות", min: 150 }, themepark: { cat: "family", he: "פארק שעשועים", min: 180 },
    hotel: { cat: "sleep", he: "מלון", min: 0 }, hostel: { cat: "sleep", he: "הוסטל", min: 0 }, guesthouse: { cat: "sleep", he: "בית הארחה", min: 0 }, apartment: { cat: "sleep", he: "דירה", min: 0 }
  };
  /* the kind of a place found on the map search (its class and type) */
  function searchKind(category, type, name) {
    if (category === "place" || category === "boundary") return "sight";
    const k = kindFromTags({ [category]: type, name: name || "" });
    if (KIND[k] && KIND[k].cat !== "sleep") return k;
    return type === "museum" ? "museum" : type === "viewpoint" ? "view" : /park|garden/.test(type || "") ? "park" : type === "beach" ? "beach" : category === "shop" ? "shop" : category === "amenity" ? "restaurant" : "attraction";
  }
  function kindFromTags(t) {
    const a = t.amenity, tu = t.tourism, sh = t.shop;
    // a place tagged both as a hotel and as a food place is usually the food place, unless its name says hotel
    if (/^(hotel|motel|hostel|guest_house|apartment)$/.test(tu || "") && /^(restaurant|cafe|fast_food|bar|pub|ice_cream)$/.test(a || "") && !/hotel|hostel|inn\b|suite|resid|albergo|hôtel|b&b|apart/i.test(t.name || ""))
      return a === "cafe" ? "cafe" : a === "ice_cream" ? "dessert" : a === "bar" || a === "pub" ? "bar" : "restaurant";
    if (t.man_made === "bridge") return "bridge";
    if (t.place === "square" || (t.highway === "pedestrian" && t.area === "yes")) return "square";
    if (t.amenity === "clock") return "attraction";
    if (t.man_made === "tower" && !tu) return "view";
    if (tu === "hotel" || tu === "motel") return "hotel";
    if (tu === "hostel") return "hostel";
    if (tu === "guest_house") return "guesthouse";
    if (tu === "apartment") return "apartment";
    if (a === "restaurant") return "restaurant";
    if (a === "cafe") return "cafe";
    if (a === "ice_cream" || sh === "pastry" || sh === "confectionery") return "dessert";
    if (sh === "bakery") return "bakery";
    if (a === "marketplace" || a === "food_court") return "market";
    if (sh === "deli" || sh === "wine") return "deli";
    if (a === "nightclub") return "club";
    if (a === "bar" || a === "pub" || a === "biergarten") return "bar";
    if (sh === "mall") return "mall";
    if (sh === "department_store") return "store";
    if (sh) return "shop";
    if (tu === "museum") return "museum";
    if (tu === "gallery") return "gallery";
    if (tu === "zoo" || tu === "aquarium") return "zoo";
    if (tu === "theme_park" || t.leisure === "water_park") return "themepark";
    if (tu === "viewpoint") return "view";
    if (a === "place_of_worship" || /^(church|monastery)$/.test(t.historic || "")) return "church";
    if (t.natural === "beach") return "beach";
    if (/^(park|garden)$/.test(t.leisure || "")) return "park";
    if (t.historic) return "sight";
    if (tu === "attraction") return /^(church|cathedral|chapel|basilica|mosque|synagogue|temple)$/.test(t.building || "") ? "church" : "attraction";
    return "attraction";
  }
  /* which kinds can fill an activity slot for each interest */
  const SLOT_KINDS = {
    history: ["sight", "square", "church", "attraction"], art: ["museum", "gallery"], view: ["view", "bridge", "square", "attraction", "sight"],
    nature: ["park", "beach", "view"], shopping: ["street", "mall", "store", "market", "shop"], family: ["zoo", "themepark", "park", "museum"],
    food: ["market", "deli", "bakery", "dessert", "cafe"], night: ["bar"]
  };

  /* typical crowd level per hour, 07:00–22:00 (16 values). An estimate, shown as such. */
  const BUSY = {
    art: [0, 0, 30, 60, 85, 90, 85, 80, 75, 60, 35, 0, 0, 0, 0, 0], history: [10, 25, 45, 70, 85, 90, 88, 85, 80, 70, 55, 40, 25, 0, 0, 0],
    view: [10, 15, 25, 40, 55, 60, 60, 60, 65, 75, 90, 95, 70, 40, 20, 10], nature: [15, 25, 35, 45, 55, 60, 60, 60, 65, 70, 65, 50, 30, 15, 0, 0],
    food: [0, 0, 10, 15, 40, 85, 90, 50, 20, 20, 30, 60, 90, 95, 70, 40], cafe: [20, 55, 75, 70, 55, 45, 40, 55, 65, 60, 40, 20, 0, 0, 0, 0],
    night: [0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 35, 55, 75, 90, 95], shopping: [0, 0, 15, 35, 55, 65, 70, 70, 75, 80, 80, 70, 40, 0, 0, 0],
    family: [0, 0, 35, 65, 85, 90, 85, 80, 70, 50, 30, 0, 0, 0, 0, 0], market: [10, 45, 70, 85, 90, 80, 55, 30, 15, 0, 0, 0, 0, 0, 0, 0]
  };
  const WHY = {
    restaurant: "מסעדה שנבחרה לפי סימני איכות, התקציב והקרבה למסלול.", cafe: "בית קפה טוב לעצירה.", dessert: "עצירה למשהו מתוק.",
    bakery: "מאפייה מקומית.", market: "שוק אוכל מקומי, מקום טוב לטעום הרבה דברים.", deli: "מעדנייה לטעימות ולמזכרות אכילות.",
    bar: "מקום לבילוי בערב.", club: "מועדון לילה.", street: "אחד מרחובות הקניות המרכזיים בעיר.", mall: "קניון גדול עם הרבה חנויות במקום אחד.", store: "כלבו גדול.", shop: "חנות מומלצת.",
    museum: "מוזיאון שמומלץ לחובבי אמנות ותרבות.", gallery: "גלריה לאמנות.", sight: "אתר היסטורי שמספר חלק מהסיפור של העיר.",
    church: "מבנה דתי מרשים, בדרך כלל פתוח למבקרים.", view: "נקודת תצפית או מקום מצולם במיוחד.", attraction: "אטרקציה מוכרת בעיר.",
    park: "פארק או גן לנשימה בין האטרקציות.", beach: "חוף לבילוי.", zoo: "אטרקציה שמתאימה גם לילדים.", themepark: "פארק שעשועים."
  };
  const TIPS = {
    restaurant: "בערב במסעדות טובות כדאי להזמין שולחן מראש. בצהריים יש לפעמים תפריט עסקי זול יותר.",
    cafe: "בהרבה ערים קפה בעמידה ליד הבר זול יותר מקפה לשולחן.", dessert: "הגלידה הכי טובה בדרך כלל בכלים מכוסים, לא בערימות צבעוניות.",
    market: "הגיעו רעבים ובבוקר, כשהדוכנים מלאים. חלק מהשווקים סגורים ביום ראשון.", mall: "בדקו החזר מע״מ לתיירים בקניות גדולות.", street: "הולכים לאורך הרחוב מקצה לקצה. בקניות גדולות בחנות אחת שואלים על החזר מע״מ לתיירים (Tax Free).",
    shop: "השוו מחירים לפני שקונים.", bar: "בהרבה ערים הלילה מתחיל מאוחר. בדקו מתי המקום מתמלא.",
    museum: "הרבה מוזיאונים סגורים יום אחד בשבוע. כדאי לבדוק באתר לפני שמגיעים.", sight: "נעליים נוחות ובקבוק מים.",
    church: "לבוש צנוע: כתפיים וברכיים מכוסות.", view: "הכי יפה בשקיעה. הגיעו בערך 20 דקות לפני.", park: "מקום טוב לפיקניק."
  };
  const LOCAL_CUISINE = {
    it: ["italian", "roman", "regional", "pizza", "tuscan", "venetian"], fr: ["french", "regional"], es: ["spanish", "tapas", "regional", "catalan", "basque"],
    pt: ["portuguese", "regional"], gr: ["greek", "regional"], cz: ["czech", "regional"], jp: ["japanese", "ramen", "sushi", "regional"],
    th: ["thai", "regional"], de: ["german", "regional"], at: ["austrian", "regional"], gb: ["british", "regional"], us: ["american", "regional"],
    nl: ["dutch", "regional"], hu: ["hungarian", "regional"], tr: ["turkish", "regional", "kebab"]
  };
  const CHAIN = /mcdonald|burger king|kfc|starbucks|subway|domino|pizza hut|costa coffee|dunkin|five guys|wendy|taco bell|tim hortons|vapiano|nando|hard rock/i;

  /* ---------- normalize sources into one pool ---------- */
  const normName = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9֐-׿Ͱ-ϿЀ-ӿ฀-๿぀-ヿ一-鿿]+/g, " ").trim();
  const similar = (a, b) => {
    const x = normName(a), y = normName(b);
    if (!x || !y) return false;
    if (x.includes(y) || y.includes(x)) return true;
    const A = new Set(x.split(" ")), B = new Set(y.split(" "));
    const inter = [...A].filter(w => w.length > 2 && B.has(w)).length;
    return inter / Math.min(A.size, B.size) >= 0.5;
  };

  /* thermal baths, hammams and spas open to visitors (Budapest's fürdő, Istanbul's hamam, Tbilisi's abanotubani) */
  const BATH = t => t.amenity === "public_bath" || t.leisure === "spa" || !!t["bath:type"] || /gyógyfürdő|fürdő|hamam|hammam|აბანო/i.test(t.name || "");
  const LATIN = /\p{Script=Latin}/u;
  const isVegan = p => !!p.vegan || /vegan/.test(p.cuisine || "");
  function fromOSM(e, cc) {
    const t = e.tags || {};
    /* a name the traveler can read: Hebrew, else the local name if it is in Latin letters, else its English/Latin form
       (Tokyo, Athens, Tbilisi, Bangkok and Belgrade have most names in their own script) */
    const name = t["name:he"] || (t.name && !LATIN.test(t.name) && [t["name:en"], t.int_name, t["name:sr-Latn"]].find(n => n && LATIN.test(n))) || t.name;
    if (!name) return null;
    const kind = kindFromTags(t);
    return {
      id: `${e.type}/${e.id}`, src: "osm", name, local: t.name || name, en: t["name:en"] || null, kind, cat: KIND[kind].cat, lat: e.lat, lng: e.lon,
      wikidata: t.wikidata || null, wikiTag: t.wikipedia || null, website: t.website || t["contact:website"] || t.url || null,
      phone: t.phone || t["contact:phone"] || null, hours: t.opening_hours || null, cuisine: t.cuisine || null,
      fee: t.fee || null, charge: t.charge || null, outdoor: t.outdoor_seating === "yes", veg: /yes|only/.test(t["diet:vegetarian"] || "") || /yes|only/.test(t["diet:vegan"] || "") || /vegetarian|vegan/.test(t.cuisine || ""), vegan: /yes|only/.test(t["diet:vegan"] || "") || /vegan/.test(t.cuisine || ""),
      kosher: /yes|only/.test(t["diet:kosher"] || "") || /kosher/.test(t.cuisine || "") || /kosher|cacher|casher|כשר/i.test(t.name || ""), michelin: +t["michelin:stars"] || 0, brand: !!t.brand, heritage: !!t.heritage, hasHe: !!t["name:he"],
      address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null, reservation: t.reservation || null,
      tourism: t.tourism || null, historic: t.historic || null, bath: BATH(t), stars: parseFloat(t.stars) || 0, jewish: t.religion === "jewish", wheel: t.wheelchair || null
    };
  }
  function voyageKind(v) {
    const txt = `${v.name} ${v.content || ""}`;
    if (v.type === "sleep") return /hostel/i.test(txt) ? "hostel" : /apartment|flat|aparthotel/i.test(txt) ? "apartment" : /guest ?house|b&b|bed and breakfast|pension/i.test(txt) ? "guesthouse" : "hotel";
    if (v.type === "eat") return /caf[eé]|coffee|bakery|pastr|ice cream|gelat|dessert/i.test(txt) && !/restaurant/i.test(txt) ? (/ice cream|gelat|dessert|pastr/i.test(txt) ? "dessert" : "cafe") : /market|food hall/i.test(txt) ? "market" : "restaurant";
    if (v.type === "drink") return /caf[eé]|coffee|tea/i.test(txt) && !/bar|pub|beer|wine|cocktail/i.test(txt) ? "cafe" : /club/i.test(txt) ? "club" : "bar";
    if (v.type === "buy" && /\b(street|avenue|boulevard|road|lane|via|rue|calle|carrer|rua|strasse|straße|ulice|utca|dori|dōri|soi|caddesi|sokak|gasse|straat)\b|street$/i.test(v.name)) return "street";
    // a supermarket chain ("Aldi discount store", "CBA supermarket") is a shop, not a market to visit
    if (v.type === "buy") return /supermarket|hypermarket|discount store|grocery|convenience|minimarket|drogerie|drugstore|pharmacy/i.test(txt) ? "shop" : /mall|shopping cent|galer|department/i.test(txt) ? "mall" : /\bmarkets?\b|mercado|mercat|marché/i.test(txt) ? "market" : "shop";
    if (v.type === "see") return /museum/i.test(txt) ? "museum" : /gallery/i.test(txt) ? "gallery" : /church|cathedral|basilica|synagogue|mosque|temple|monastery/i.test(txt) ? "church" : /park|garden/i.test(txt) ? "park" : /view|lookout|tower/i.test(txt) ? "view" : "sight";
    return /zoo|aquarium/i.test(txt) ? "zoo" : /park|garden/i.test(txt) ? "park" : /beach/i.test(txt) ? "beach" : "attraction";
  }
  /* Wikipedia "nearby" articles as sights (only used when the map data is thin) */
  const WIKI_SKIP = /(תחנת|רחוב|שדרות|כביש|קו |שדה התעופה|נמל התעופה|בית חולים|אוניברסיט|בית ספר|שגרירות|מלון|שכונ|רכבת|מטרו|חשמלית|מחוז|station|street|road|avenue|line\b|airport|hospital|universit|school|embassy|hotel|district|neighbourhood|neighborhood|metro|railway|tram|bus\b|constituency|company)/i;
  function wikiKind(t) {
    if (/(מוזיאון|גלריה|museum|gallery)/i.test(t)) return "museum";
    if (/(כנסיי|קתדרל|בזיליק|מנזר|בית הכנסת|מסגד|מקדש|קפלה|church|cathedral|basilica|monastery|synagogue|mosque|temple|chapel|abbey)/i.test(t)) return "church";
    if (/(פארק|גן |גני |park|garden)/i.test(t)) return "park";
    if (/(גשר|כיכר|מגדל|תצפית|bridge|square|tower|viewpoint)/i.test(t)) return "view";
    return "sight";
  }

  const VOY_CATS = { sleep: ["sleep"], eat: ["food", "night"], drink: ["food", "night"], buy: ["shopping", "food"],
    see: ["history", "art", "view", "nature", "family"], do: ["history", "art", "view", "nature", "family", "night"] };
  const HOTEL_WORDS = new Set(["hotel", "hotels", "hostel", "hôtel", "residence", "residences", "apartments", "apartment", "aparthotel", "suites", "suite", "boutique", "design", "house", "inn", "the", "and", "spa", "by", "de", "la", "le", "du", "di", "del", "city", "old", "town", "centre", "center", "grand", "luxury", "collection", "small", "world", "leading", "hotels", "astotel", "albergo", "pension", "guest", "b&b", "bed", "breakfast"]);
  const hotelWords = s => [...new Set(normName(s).split(" ").filter(x => x.length > 2 && !HOTEL_WORDS.has(x)))];
  /* the same hotel if they share a telling word: words that many hotels in the city use ("Times Square", "Old Town", the city name) do not count */
  function sameHotel(a, b, common, d) {
    const A = hotelWords(a), B = new Set(hotelWords(b));
    if (!A.length || !B.size) return d < 0.06 && normName(a) === normName(b);
    const shared = A.filter(x => B.has(x));
    if (!shared.length) return false;
    const telling = shared.filter(x => !common.has(x));
    // two telling words in common, or one when they stand in the very same spot (a hotel and its neighbour often share one word)
    if (telling.length >= 2 || (telling.length && d < 0.07)) return true;
    // only common words in common: accept just when the names are made of nothing else, in the same spot
    return d < 0.05 && shared.length === A.length && shared.length === B.size;
  }
  function buildPool(data, geo) {
    const cc = geo.cc;
    const pool = [];
    const seen = new Map();
    for (const e of data.els || []) {
      const p = fromOSM(e, cc);
      if (!p) continue;
      const key = p.wikidata || `${p.kind}|${normName(p.local)}`;
      const old = seen.get(key);
      if (old) {
        // two map objects with one Wikipedia id: keep the main one (the basilica, not the museum inside it that borrowed its id)
        const pref = x => (x.hasHe ? 2 : 0) + (x.id.startsWith("node") ? 0 : 1) + (/\b(museu|museo|museum|musée|shop|store|ticket|entrance|vstup|eingang)\b/i.test(x.local) ? -3 : 0);
        if (pref(p) > pref(old)) { pool[pool.indexOf(old)] = p; seen.set(key, p); }
        continue;
      }
      seen.set(key, p);
      pool.push(p);
    }
    // main shopping streets, counted from the shops along them
    const SHOP_HE = SRC.SHOP_HE || {};
    for (const st of data.streets || []) {
      if (km(geo, st) > 12) continue;
      if (/(náměstí|piazza|plaza|\bplace\b|platz|square|\btér\b|\bplac\b|rynek|praça|plaça|meydan)/i.test(st.name) && st.n < 15) continue;
      const kinds = (st.kinds || []).map(([k]) => SHOP_HE[k]).filter(Boolean);
      pool.push({ id: `street/${normName(st.name)}`, src: "osm", name: st.name, local: st.name, kind: "street", cat: "shopping", lat: st.lat, lng: st.lng,
        shops: st.n, brands: st.brands || 0, topShare: st.topShare ?? (st.kinds?.[0] ? st.kinds[0][1] / st.n : 0.6), streetLen: st.len || 0, shopKinds: [...new Set(kinds)].slice(0, 3), ends: st.ends || null, wikidata: null, website: null });
    }
    const streetNames = pool.filter(p => p.kind === "street").map(p => ({ p, n: normName(p.local) })).filter(x => x.n.length >= 5);
    // Wikivoyage: attach to the matching OpenStreetMap place, or add as a new place
    const noGeo = [];
    for (const v of data.voyage || []) {
      const kind = voyageKind(v);
      // a shopping street that Wikivoyage mentions in an address or a recommendation
      const vt = normName(`${v.address || ""} ${v.content || ""} ${v.name}`);
      for (const x of streetNames) if (vt.includes(x.n)) x.p.mentions = (x.p.mentions || 0) + 1;
      if (kind === "street") {
        const same = pool.find(p => p.kind === "street" && similar(p.local, v.name) && (v.lat == null || km(p, v) < 1.5));
        if (same) { same.voyage = { text: v.content, price: null, priceClass: null, hours: v.hours, district: v.district || null }; continue; }
      }
      if (v.lat == null) { noGeo.push({ ...v, kind, cat: KIND[kind].cat }); continue; }
      if (km(geo, { lat: v.lat, lng: v.lng }) > 12) continue;
      // only match the same kind of place: a hotel listing must not become a restaurant's (or a square's) recommendation
      const fits = VOY_CATS[v.type] || [];
      // the closest name wins: "Sagrada Família" is the basilica, not the "Museu de la Sagrada Família" next to it
      const vn = normName(v.name);
      const match = pool.filter(p => fits.includes(p.cat) && km(p, v) < 0.15 && (similar(p.local, v.name) || (v.alt && similar(p.local, v.alt))))
        .sort((a, b) => ((v.wikidata && b.wikidata === v.wikidata) - (v.wikidata && a.wikidata === v.wikidata)) || Math.abs(normName(a.local).length - vn.length) - Math.abs(normName(b.local).length - vn.length))[0];
      const vo = { text: v.content, price: v.price, priceClass: v.priceClass, hours: v.hours, district: v.district || null };
      const vk = /kosher|cacher|glatt/i.test(`${v.name} ${v.content || ""}`), vv = /vegetarian|vegan/i.test(`${v.name} ${v.content || ""}`);
      if (match) {
        match.voyage = vo;
        if (vk) match.kosher = true;
        if (vv) match.veg = true;
        match.website = match.website || v.url; match.phone = match.phone || v.phone; match.address = match.address || v.address;
        if (v.wikidata && !match.wikidata && !["food", "night", "shopping", "sleep"].includes(match.cat)) match.wikidata = v.wikidata;
      } else {
        pool.push({ id: `wv/${normName(v.name)}`, src: "voyage", name: v.name, local: v.name, kind, cat: KIND[kind].cat, lat: v.lat, lng: v.lng,
          wikidata: ["food", "night", "shopping", "sleep"].includes(KIND[kind].cat) ? null : v.wikidata, website: v.url, phone: v.phone, hours: null, address: v.address, voyage: vo, kosher: vk, veg: vv });
      }
    }
    // Wikipedia nearby articles: only fill in sights when the map data has few of them
    const sights = pool.filter(p => ["history", "art", "view"].includes(p.cat)).length;
    if (sights < 30) {
      const wiki = [...(data.wiki?.he || []), ...(data.wiki?.en || [])];
      const added = [];
      for (const w of wiki) {
        if (WIKI_SKIP.test(w.title)) continue;
        if (pool.some(p => p.wikidata && km(p, w) < 0.1)) continue;
        const twin = added.find(o => km(o, w) < 0.06);
        if (twin) { if (w.lang === "en") twin._en = w.title; continue; }
        const kind = wikiKind(w.title);
        const clean = w.title.replace(/\s*\([^)]*\)\s*$/, "");
        const p = { id: `wiki/${w.lang}/${w.pageid}`, src: "wiki", name: clean, local: clean, kind, cat: KIND[kind].cat, lat: w.lat, lng: w.lng, wikiBonus: w.lang === "he" ? 3 : 1.5 };
        p["_" + w.lang] = w.title;
        added.push(p);
      }
      pool.push(...added);
    }
    // Tripadvisor: attach the rating and price to the same hotel from the map, or add the hotel if the map does not have it
    if (data.ta?.h) {
      const freq = new Map();
      [...pool.filter(p => p.cat === "sleep").map(p => p.local), ...data.ta.h.map(h => h[1])].forEach(n => hotelWords(n).forEach(w => freq.set(w, (freq.get(w) || 0) + 1)));
      const common = new Set([...freq].filter(([, n]) => n >= 3).map(([w]) => w));
      for (const [id, name, lat, lng, r, c, price, styles] of data.ta.h) {
        const t = { lat, lng };
        // only hotels in the city itself and with a decent rating
        if (r < 4 || km(geo, t) > 15) continue;
        const info = { r, c, p: price, st: styles, url: `https://www.tripadvisor.com/Hotel_Review-g${data.ta.geo}-d${id}-Reviews.html` };
        // match by the distinctive words of the name ("Hotel" or the city name are not enough: two neighbors share them)
        const match = pool.find(p => p.cat === "sleep" && !p.ta && km(p, t) < 0.3 && sameHotel(p.local, name, common, km(p, t)));
        if (match) { match.ta = info; continue; }
        // not on the map under this name (often a local-language name): add it, and drop an unrated map hotel in the very same spot
        pool.forEach(p => { if (p.cat === "sleep" && !p.ta && km(p, t) < 0.025) p.hide = true; });
        pool.push({ id: `ta/${id}`, src: "ta", name, local: name, kind: /hostel/i.test(name) ? "hostel" : /apart|residence|suites/i.test(name) ? "apartment" : "hotel", cat: "sleep", lat, lng, ta: info, website: null, wikidata: null });
      }
    }
    // how famous: Wikipedia languages with an article about the place, and its Hebrew article when there is one
    const F = data.fame || {};
    pool.forEach(p => {
      p.dist = km(geo, p);
      if (p.wikidata && F.n?.[p.wikidata] != null) p.fame = F.n[p.wikidata];
      if (p.wikidata && F.he?.[p.wikidata] && !p._he) p._he = F.he[p.wikidata];
    });
    return { pool: pool.filter(p => !p.hide), noGeo };
  }

  /* ---------- how the traveler moves: on foot, by public transport or by car ----------
     core: the "heart" radius as a share of the city radius; reach: how far from the day's main place (km);
     dk: cost of each km from the day's main place; out: cost of each km beyond the heart; gap: minimum km between days' main places;
     meal: cost of each km to a restaurant; bfast/lunch/dinner: how far to look for meals (near, far) */
  const MOVE = {
    walk: { core: 0.4, reach: 1.5, dk: 2.2, out: 1.6, gap: 1.0, meal: 2.6, bfast: [0.6, 1.2], lunch: [0.6, 1.5], dinner: [0.8, 1.8] },
    transit: { core: 0.65, reach: 3, dk: 1.0, out: 0.7, gap: 1.6, meal: 1.6, bfast: [0.8, 2], lunch: [1, 3], dinner: [1.2, 3.5] },
    car: { core: 1.0, reach: 7, dk: 0.35, out: 0.2, gap: 2.5, meal: 0.7, bfast: [1.5, 4], lunch: [2, 6], dinner: [2.5, 7] }
  };

  /* ---------- quality ---------- */
  const BUDGET_CLASS = { "חסכוני": "budget", "בינוני": "mid", "מפנק": "splurge" };
  /* "signals" are shown to the traveler, so the ranking is never a black box */
  function rate(p, cc, budget, mobility) {
    let q = 0;
    const sig = [];
    // accessibility: OpenStreetMap marks many places as wheelchair accessible (yes), partly (limited) or not (no)
    if (mobility) {
      if (p.wheel === "yes") { q += 2.5; sig.push("נגיש לכיסא גלגלים"); }
      else if (p.wheel === "limited") { q += 0.5; sig.push("נגישות חלקית"); }
      else if (p.wheel === "no") q -= mobility === "wheelchair" ? 7 : 3;
    }
    if (p.michelin) { q += 6; sig.push(`כוכב מישלן${p.michelin > 1 ? ` ×${p.michelin}` : ""}`); if (p.michelin >= 2 && budget !== "מפנק") q -= 9; } // two or three stars are a splurge
    if (p.voyage) { q += 4; sig.push("מומלץ ב-Wikivoyage"); }
    if (p.wikidata) { q += 2.5; if (p.cat === "food" || p.cat === "night" || p.cat === "shopping") sig.push("מקום מוכר"); }
    if (p.wikiTag || p._he || p._en) q += 2;
    if (p.hasHe) q += 2.5;
    if (p.wikiBonus) q += p.wikiBonus;
    // a plaque or a statue of a famous person borrows that person's fame: it is not a sight to plan a day around
    const minor = /^(memorial|wayside_shrine|wayside_cross|boundary_stone|milestone|stone|marker)$/.test(p.historic || "");
    if (minor) q -= 4;
    if (p.fame && !minor) { q += Math.min(12, p.fame / 6); if (p.fame >= 50 && !["food", "night", "shopping", "sleep"].includes(p.cat)) sig.push("מהמקומות המפורסמים בעיר"); }
    if (p.heritage) q += 1;
    if (p.tourism === "attraction") q += 1.5;
    if (p.kind === "museum") q += 1;
    if (p.website) q += 1;
    if (p.hours) q += 0.7;
    if (p.phone) q += 0.3;
    if (p.cat === "food") {
      const cu = (p.cuisine || "").toLowerCase();
      if (cu) q += 0.4;
      if ((LOCAL_CUISINE[cc] || []).some(c => cu.includes(c))) { q += 1.6; sig.push("מטבח מקומי"); }
      if (/(burger|kebab|fast_food|chicken|friture)/.test(cu)) q -= budget === "חסכוני" ? 1 : 2.5;
      // a budget trip should really eat cheaper: simple local places first, starred restaurants last
      if (budget === "חסכוני") {
        if (/pizza|kebab|sandwich|street|noodle|falafel|crepe|ramen|tapas|gyros|souvlaki|empanada|taco/.test(cu) || /trattoria|osteria|taverna|pizzeria|bistro|tapas|street|kebab|falafel|canteen|mensa|bufet/i.test(p.local || "")) q += 2;
        if (p.michelin) q -= 6;
        if (p.voyage?.priceClass === "budget") q += 1.5;
      }
      if (p.kind === "market") { q += 1.5; }
      const pc = p.voyage?.priceClass, want = BUDGET_CLASS[budget];
      if (pc && want) {
        if (pc === want) { q += 2; }
        else if ((want === "budget" && pc === "splurge") || (want === "splurge" && pc === "budget")) q -= 2.5;
        else q -= 0.6;
      }
      if (p.outdoor) sig.push("ישיבה בחוץ");
      if (p.vegan) sig.push("אפשרויות טבעוניות"); else if (p.veg) sig.push("אפשרויות צמחוניות");
      if (p.kosher) sig.push("כשר");
    }
    if (p.brand || CHAIN.test(p.local || "")) { q -= p.kind === "mall" || p.kind === "store" ? 0 : 6; }
    if (p.kind === "mall") q += /carrefour|monoprix|franprix|lidl|aldi|tesco|sainsbury|spar\b|billa|albert|coop|conad|mercadona|dia\b|rewe|edeka|penny|kaufland|auchan|intermarch/i.test(p.local || "") ? -8 : 1.5;
    if (p.kind === "street") {
      q += 2 + Math.min(9, SRC.streetScore({ n: p.shops, topShare: p.topShare, brands: p.brands, mentions: p.mentions }) / 8);
      if (p.voyage) q -= 2.5; // a Wikivoyage listing counts once, like a mention
      if ((p.topShare ?? 0) > 0.75) q -= 3; // a street of only one kind of shop (jewelers, phones) is a niche, not a main shopping street
      sig.push(`${p.shops} חנויות ברחוב`);
      if (p.shopKinds?.length) sig.push(p.shopKinds.join(", "));
      if (p.mentions && !p.voyage) sig.push("מוזכר ב-Wikivoyage");
    }
    if (p.cat === "sleep" && p.ta) {
      // what thousands of guests say counts more than stars on a map
      q += (p.ta.r - 4) * 5 + Math.min(4, Math.log10(Math.max(10, p.ta.c)) * 1.2);
      sig.push(`Tripadvisor ${p.ta.r} (${p.ta.c.toLocaleString("en-US")} ביקורות)`);
    }
    if (p.cat === "sleep") {
      if (p.brand) q += 6;
      if (p.stars) { q += p.stars * 0.8; sig.push("★".repeat(Math.min(5, Math.round(p.stars)))); }
      if (!p.priceClass) p.priceClass = p.voyage?.priceClass || (p.kind === "hostel" ? "budget" : p.stars >= 4.5 ? "splurge" : p.stars >= 3 ? "mid" : p.stars ? "budget" : null);
      const want = BUDGET_CLASS[budget];
      if (p.priceClass && want) q += p.priceClass === want ? 2 : (want === "budget" && p.priceClass === "splurge") || (want === "splurge" && p.priceClass === "budget") ? -3 : -0.5;
    }
    p.q = Math.round(q * 10) / 10;
    p.signals = sig;
    return p;
  }
  const PRICE_SIGN = { budget: "זול", mid: "מחיר בינוני", splurge: "יוקרתי" };

  /* ---------- picking ---------- */
  function pickFor(cands, n, chosen, minGapKm = 0.15) {
    const out = [];
    const cnt = {};
    for (const p of chosen) cnt[p.kind] = (cnt[p.kind] || 0) + 1;
    const rest = [...cands];
    while (out.length < n && rest.length) {
      let bi = -1, bv = -Infinity;
      rest.forEach((p, i) => {
        if ([...chosen, ...out].some(o => o.id === p.id || km(o, p) < minGapKm)) return;
        const v = p.q - (p.cpen ?? p.dist * 0.6) - (p.kind === "church" || p.kind === "cafe" ? 3 : 2) * (cnt[p.kind] || 0);
        if (v > bv) { bv = v; bi = i; }
      });
      if (bi < 0) break;
      const p = rest.splice(bi, 1)[0];
      out.push(p);
      cnt[p.kind] = (cnt[p.kind] || 0) + 1;
    }
    return out;
  }
  function splitDays(pts, days) {
    if (days <= 1 || pts.length <= 1) return [pts];
    const c = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
    const k = Math.cos(c.lat * Math.PI / 180);
    const arr = pts.map(p => ({ p, a: Math.atan2(p.lat - c.lat, (p.lng - c.lng) * k) })).sort((x, y) => x.a - y.a);
    let start = 0, best = -1;
    for (let i = 0; i < arr.length; i++) {
      const gap = (arr[(i + 1) % arr.length].a - arr[i].a + 2 * Math.PI) % (2 * Math.PI);
      if (gap > best) { best = gap; start = (i + 1) % arr.length; }
    }
    const rot = [...arr.slice(start), ...arr.slice(0, start)].map(x => x.p);
    const out = [];
    for (let d = 0; d < days; d++) out.push(rot.slice(Math.round(d * rot.length / days), Math.round((d + 1) * rot.length / days)));
    return out;
  }
  function orderDay(pts, start) {
    if (!pts.length) return pts;
    if (pts.length <= 2 && !start) return pts;
    if (pts.length > 7) {
      const rest0 = [...pts].sort((a, b) => start ? km(start, a) - km(start, b) : 0);
      const out = [rest0[0]], rest = rest0.slice(1);
      while (rest.length) { const last = out[out.length - 1]; rest.sort((a, b) => km(last, a) - km(last, b)); out.push(rest.shift()); }
      return out;
    }
    let best = null, bestLen = Infinity;
    const perm = (used, cur, len) => {
      if (len >= bestLen) return;
      if (cur.length === pts.length) { bestLen = len; best = [...cur]; return; }
      for (let i = 0; i < pts.length; i++) {
        if (used[i]) continue;
        used[i] = true; cur.push(pts[i]);
        perm(used, cur, len + (cur.length > 1 ? km(cur[cur.length - 2], pts[i]) : start ? km(start, pts[i]) : 0));
        cur.pop(); used[i] = false;
      }
    };
    perm([], [], 0);
    return best;
  }

  /* ---------- hours ---------- */
  const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  /* "open now" for common OpenStreetMap formats. Returns true/false, or null when unsure. */
  function isOpen(hours, date) {
    if (!hours) return null;
    const h = hours.trim();
    if (/24\/7/.test(h)) return true;
    const dow = (date.getDay() + 6) % 7, mins = date.getHours() * 60 + date.getMinutes();
    let decided = null;
    for (const rule of h.split(";").map(r => r.trim()).filter(Boolean)) {
      if (/PH|SH|week|[A-Z][a-z]{2}\s\d/.test(rule) && !/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(rule)) continue;
      const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?\s*)+)?\s*(.*)$/);
      if (!m) return null;
      let applies = true;
      if (m[1]) {
        applies = false;
        for (const part of m[1].split(",").map(x => x.trim()).filter(Boolean)) {
          const [a, b] = part.split("-").map(x => DAYS.indexOf(x));
          if (a < 0) return null;
          const end = b >= 0 ? b : a;
          if (a <= end ? dow >= a && dow <= end : dow >= a || dow <= end) applies = true;
        }
      }
      if (!applies) continue;
      const rest = m[2].trim();
      if (/^(off|closed)$/i.test(rest)) { decided = false; continue; }
      const ranges = [...rest.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
      if (!ranges.length) return null;
      decided = ranges.some(r => {
        const s = +r[1] * 60 + +r[2]; let e = +r[3] * 60 + +r[4];
        if (e <= s) e += 24 * 60;
        return (mins >= s && mins < e) || (mins + 24 * 60 >= s && mins + 24 * 60 < e);
      });
    }
    return decided;
  }
  function openRange(h) {
    if (!h) return null;
    if (/24\/7/.test(h)) return [0, 24];
    const m = h.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    return m ? [+m[1] + +m[2] / 60, (+m[3] || 24) + +m[4] / 60] : null;
  }
  function busyFor(p) {
    const key = p.kind === "market" ? "market" : (p.kind === "cafe" || p.kind === "bakery" || p.kind === "dessert") ? "cafe" : p.cat;
    let b = [...(BUSY[key] || BUSY.history)];
    const r = openRange(p.hours);
    if (r) b = b.map((v, i) => { const h = 7 + i; return h + 0.5 < r[0] || h >= r[1] ? 0 : Math.max(v, 15); });
    return b;
  }
  function bestTime(busy, p) {
    const cands = busy.map((v, i) => ({ v, h: 7 + i })).filter(x => x.v > 0 && (p.cat === "night" ? x.h >= 19 : p.kind === "view" ? true : x.h >= 8 && x.h <= 18));
    if (!cands.length) return "";
    if (p.kind === "view") { const peak = cands.reduce((a, b) => b.v > a.v ? b : a); return `לשקיעה, בסביבות ${peak.h}:00. לפחות אנשים: בבוקר`; }
    const low = cands.reduce((a, b) => b.v < a.v ? b : a);
    return `בסביבות ${String(low.h).padStart(2, "0")}:00`;
  }

  /* ---------- stop objects ---------- */
  const fmtTime = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
  const fmtDur = m => {
    if (m < 60) return `${m} דקות`;
    const named = { 60: "שעה", 75: "שעה ורבע", 90: "שעה וחצי", 120: "שעתיים", 150: "שעתיים וחצי", 180: "3 שעות" };
    if (named[m]) return named[m];
    const h = Math.floor(m / 60), r = m % 60;
    return `${h === 1 ? "שעה" : h === 2 ? "שעתיים" : h + " שעות"}${r ? ` ו-${r} דק׳` : ""}`;
  };
  function costText(p, budget) {
    if (p.kind === "street") return "חינם להסתובב";
    if (p.voyage?.price) return p.voyage.price;
    if (p.fee === "no") return "חינם";
    if (p.charge) return p.charge;
    if (p.cat === "food") return p.voyage?.priceClass ? PRICE_SIGN[p.voyage.priceClass] : { "חסכוני": "זול", "בינוני": "מחיר בינוני", "מפנק": "יוקרתי" }[budget] || "מחיר בינוני";
    if (p.fee === "yes") return "בתשלום";
    return { art: "בתשלום, בדרך כלל", family: "בתשלום", view: "בדרך כלל חינם", nature: "בדרך כלל חינם", night: "לפי מה שמזמינים", shopping: "—" }[p.cat] || "תלוי במקום";
  }
  function bookingFor(p, meal) {
    const needed = ["museum", "zoo", "themepark"].includes(p.kind) || p.fee === "yes" || (meal === "dinner" && (p.reservation === "yes" || p.reservation === "recommended" || p.michelin || p.voyage?.priceClass === "splurge"));
    const q = `${p.local} ${p.cat === "food" ? "reservation" : "official site tickets"}`;
    if (p.cat === "food") return {
      needed, query: q, url: p.website || null,
      steps: needed
        ? [p.website ? "פותחים את האתר של המסעדה (הכפתור למטה) ומחפשים הזמנת שולחן." : "מחפשים את המסעדה בגוגל מפות ומתקשרים או מזמינים דרך האתר שלה.", "בוחרים שעה. במסעדות מבוקשות כדאי להזמין כמה ימים מראש.", "שומרים את אישור ההזמנה בטלפון."]
        : [p.hours ? `שעות פתיחה: ${p.hours}` : "בודקים שעות פתיחה בגוגל מפות.", p.website ? "אפשר לבדוק באתר אם יש הזמנת שולחן." : "אם אין הזמנה מראש, מגיעים קצת לפני או אחרי שעת השיא."]
    };
    if (needed) return {
      needed, query: q, url: p.website || null,
      steps: [p.website ? "פותחים את האתר הרשמי של המקום (הכפתור למטה)." : "מחפשים את האתר הרשמי (הכפתור למטה). היזהרו מאתרי מכירה חיצוניים עם עמלה.", "בודקים שעות פתיחה ויום סגור שבועי.", "בוחרים תאריך ושעת כניסה. בבוקר בדרך כלל פחות עמוס.", "משלמים באתר ושומרים את הכרטיס בטלפון."]
    };
    return { needed: false, query: q, url: p.website || null, steps: ["אין צורך בהזמנה מראש.", p.hours ? `שעות פתיחה: ${p.hours}` : "בדקו שעות פתיחה לפני שמגיעים."] };
  }
  const streetWhy = p => `אחד מרחובות הקניות המרכזיים בעיר: כ-${p.shops} חנויות${p.shopKinds?.length ? ` (${p.shopKinds.join(", ")})` : ""} לאורך ${p.streetLen > 150 ? `${Math.round(p.streetLen / 50) * 50} מטר` : "קטע קצר"} של רחוב אחד.`;
  const MEAL = { hotel: "יוצאים מהמלון", breakfast: "ארוחת בוקר", lunch: "ארוחת צהריים", treat: "הפסקה מתוקה", dinner: "ארוחת ערב", drinks: "בילוי ערב" };
  const MEAL_MIN = { hotel: 0, breakfast: 45, lunch: 75, treat: 30, dinner: 90, drinks: 90 };
  function toStop(p, budget, meal = null) {
    const busy = busyFor(p);
    const min = meal ? MEAL_MIN[meal] : (KIND[p.kind]?.min || 60);
    if (meal === "hotel") return { name: p.name, local: p.local, cat: "sleep", kind: p.kind, kindHe: KIND[p.kind]?.he, meal, mealHe: MEAL.hotel, lat: p.lat, lng: p.lng, time: "", duration: "", _min: 0, cost: "", why: "המלון שבחרתם. כל יום יוצא מכאן.", whyLang: "he", history: "", histLang: "he", fact: "", busy: null, best: "", tip: "", nearby: [], booking: { needed: false, steps: [], query: p.local }, website: p.website || null, phone: p.phone || null, address: p.address || null, image: null, hours: null, signals: p.signals || [], q: p.q, priceClass: p.priceClass || null, osm: p.id, isHotel: true };
    const why = p.voyage?.text ? p.voyage.text : p.kind === "street" ? streetWhy(p) : p.area ? "אזור שביקשתם לראות. הכי טוב לשוטט בו ברגל, בלי תוכנית מדויקת." : WHY[p.kind] || WHY.attraction;
    return {
      name: p.name, local: p.local, cat: p.cat, kind: p.kind, kindHe: KIND[p.kind]?.he, meal, mealHe: meal ? MEAL[meal] : null,
      lat: p.lat, lng: p.lng, time: "", duration: fmtDur(min), _min: min, cost: costText(p, budget),
      why, whyLang: p.voyage?.text ? "en" : "he", history: "", histLang: "he", wikiUrl: null, fact: "",
      busy, busySrc: "est", best: bestTime(busy, p), tip: TIPS[p.kind] || "", nearby: [],
      booking: bookingFor(p, meal), website: p.website || null, phone: p.phone || null, address: p.address || null, image: null, hours: p.hours || p.voyage?.hours || null,
      cuisine: p.cuisine || null, signals: p.signals || [], q: p.q, priceClass: p.voyage?.priceClass || null,
      price: p.voyage?.price || null, fee: p.fee || null, mich: p.michelin || 0, wheel: p.wheel || null, shops: p.shops || 0, ends: p.ends || null,
      wikidata: p.wikidata || null, osm: p.id, _wikiTag: p.wikiTag || null, _he: p._he || null, _en: p._en || null, voyage: !!p.voyage
    };
  }
  /* compact form kept in the trip for the explore lists */
  const toPlace = p => ({
    id: p.id, name: p.name, local: p.local, kind: p.kind, cat: p.cat, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), q: p.q, signals: p.signals,
    cuisine: p.cuisine || null, hours: p.hours || p.voyage?.hours || null, website: p.website || null, phone: p.phone || null, address: p.address || null,
    price: p.voyage?.price || null, priceClass: p.priceClass || p.voyage?.priceClass || null, stars: p.stars || 0, vtext: p.voyage?.text || null, veg: p.veg || false, kosher: p.kosher || false,
    outdoor: p.outdoor || false, wikidata: p.wikidata || null, _he: p._he || null, _en: p._en || null,
    ta: p.ta || null, fame: p.fame || 0, fee: p.fee || null, mich: p.michelin || 0, wheel: p.wheel || null, shops: p.shops || 0, shopKinds: p.shopKinds || null, streetLen: p.streetLen || 0, ends: p.ends || null,
    vtext2: p.kind === "street" && !p.voyage?.text ? streetWhy(p) : null
  });

  /* minutes from stop i to stop i+1: walking, a ride on public transport when it is far, or a drive plus parking */
  function legMinutes(day, i) {
    const a = day.stops[i], b = day.stops[i + 1];
    if (!b) return 0;
    const leg = day.legs?.[i], d = km(a, b);
    if (day.move === "car") return d < 0.6 ? d * 1.25 / 4.6 * 60 : (leg ? leg.s / 60 : d * 1.35 / 22 * 60) + 8;
    const walk = leg && day.move !== "car" ? leg.s / 60 : d * 1.25 / 4.6 * 60;
    if (day.move === "transit" && d > 1.2) return Math.min(walk, 10 + d * 3.5);
    return walk;
  }
  function assignTimes(day) {
    const start = day.startMin || 9 * 60;
    let t = start;
    day.stops.forEach((s, i) => {
      if (s.meal === "hotel") t = start - 30;
      if (s.meal === "breakfast") t = Math.max(t, start - 15);
      if (s.meal === "lunch") t = Math.max(t, 12.75 * 60);
      if (s.sunset && day.sunsetMin) t = Math.max(t, day.sunsetMin - 35);
      if (s.meal === "dinner") t = Math.max(t, 19.5 * 60, s.sunset ? 0 : 0);
      if (s.meal === "drinks") t = Math.max(t, 21.25 * 60);
      t = Math.round(t / 15) * 15;
      s.time = fmtTime(t);
      t += (s._min || 60) + Math.min(legMinutes(day, i), day.move === "car" ? 60 : 45) + 10;
    });
  }
  /* ---------- the order of a day: the shortest sensible walk, with meals at meal times ----------
     Breakfast opens the day and dinner (then drinks) closes it; lunch lands around 13:00 and the sweet break in the afternoon.
     A sunset stop stays the last sight. Everything else is ordered for the least walking (or driving). */
  const FIXED_START = ["hotel", "breakfast"], FIXED_END = ["dinner", "drinks"];
  function optimizeDay(day) {
    const stops = day.stops.filter(s => s.lat != null && s.lng != null);
    if (stops.length !== day.stops.length || stops.length < 3) return false;
    const head = FIXED_START.map(m => stops.find(s => s.meal === m)).filter(Boolean);
    const tail = FIXED_END.map(m => stops.find(s => s.meal === m)).filter(Boolean);
    const lunch = stops.find(s => s.meal === "lunch"), treat = stops.find(s => s.meal === "treat");
    const sunset = stops.find(s => s.sunset && !s.meal);
    const acts = stops.filter(s => !s.meal && s !== sunset);
    const speed = day.move === "car" ? 22 : day.move === "transit" ? 12 : 4.6; // km per hour, for the clock only
    const start = day.startMin || 540;
    // distances once, by index (the search below tries thousands of orders)
    stops.forEach((s, i) => { s._oi = i; });
    const D = stops.map(a => stops.map(b => km(a, b)));
    const cost = seq => {
      let dist = 0, t = start, pen = 0;
      for (let i = 0; i < seq.length; i++) {
        if (i) { const d = D[seq[i - 1]._oi][seq[i]._oi]; dist += d; t += d * 1.25 / speed * 60 + 10; }
        const s = seq[i];
        // lunch: around 13:00; arriving early means waiting, which wastes the morning
        if (s.meal === "lunch") { const wait = Math.max(0, 12.5 * 60 - t); t += wait; pen += wait / 60 * 1.2 + Math.max(0, Math.abs(t - 13 * 60) - 45) / 60 * 1.5; }
        if (s.meal === "treat") { if (t < 14.5 * 60 || t > 17.5 * 60) pen += 0.8; }
        t += s._min || 60;
      }
      return dist + pen;
    };
    const build = (order, li, ti) => {
      const mid = [...order];
      if (sunset) mid.push(sunset);
      if (treat) mid.splice(Math.min(ti, mid.length), 0, treat);
      if (lunch) mid.splice(Math.min(li, mid.length), 0, lunch);
      return [...head, ...mid, ...tail];
    };
    let best = null, bv = Infinity;
    const tryAll = order => {
      const n = order.length + (sunset ? 1 : 0);
      for (let li = lunch ? 0 : n; li <= n; li++)
        for (let ti = treat ? 0 : n + 1; ti <= n + (lunch ? 1 : 0); ti++) {
          if (lunch && treat && ti <= li) continue; // the sweet break comes after lunch
          const seq = build(order, li, ti), v = cost(seq);
          if (v < bv) { bv = v; best = seq; }
        }
    };
    if (acts.length <= 6) {
      const perm = (arr, k = 0) => { if (k === arr.length) return tryAll(arr); for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; } };
      perm([...acts]);
    } else {
      // many stops: nearest neighbour from the morning point, then improve by swapping pairs
      const from = head[head.length - 1] || acts[0];
      const rest = [...acts], order = [];
      let cur = from;
      while (rest.length) { rest.sort((a, b) => km(cur, a) - km(cur, b)); cur = rest.shift(); order.push(cur); }
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
          const o2 = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
          const before = bv; tryAll(o2);
          if (bv < before - 1e-9) { order.splice(0, order.length, ...best.filter(s => acts.includes(s))); improved = true; }
        }
      }
      tryAll(order);
    }
    stops.forEach(s => { delete s._oi; });
    if (!best) return false;
    const changed = best.some((s, i) => s !== day.stops[i]);
    if (changed) { day.stops = best; day.route = null; day.legs = null; }
    assignTimes(day);
    return changed;
  }
  async function computeRoute(day, signal) {
    const r = await svc.walkRoute(day.stops, signal, day.move === "car" ? "car" : "foot");
    day.route = r?.line || null;
    day.legs = r?.legs || null;
    assignTimes(day);
    return day;
  }

  /* ---------- loading data: instant for popular cities, time-boxed for the rest ---------- */
  const POOL_KEY = "masa-pools2";
  function cachedData(key) { try { return (JSON.parse(localStorage.getItem(POOL_KEY) || "{}"))[key] || null; } catch { return null; } }
  function cacheData(key, data) {
    const entry = { ...data, t: Date.now() };
    try {
      const all = JSON.parse(localStorage.getItem(POOL_KEY) || "{}");
      all[key] = entry;
      Object.keys(all).sort((x, y) => all[y].t - all[x].t).slice(3).forEach(k => delete all[k]);
      localStorage.setItem(POOL_KEY, JSON.stringify(all));
    } catch {
      // storage full: keep only this city
      try { localStorage.setItem(POOL_KEY, JSON.stringify({ [key]: entry })); } catch {}
    }
  }
  const LIVE_ORDER = ["restaurants", "sights", "landmarks", "sights2", "cafes", "hotels", "shopping", "streets", "diet", "extra"];
  /* finish what a previous visit could not get (busy servers), quietly, for next time */
  const filling = new Map();
  function fillLater(key, base, q, geo, R) {
    if (!filling.has(key)) filling.set(key, fillNow(key, base, q, geo).finally(() => filling.delete(key)));
    return filling.get(key);
  }
  async function fillNow(key, base, q, geo) {
    const data = { ...base, els: [...(base.els || [])], done: { ...(base.done || {}) } };
    {
      for (const k of LIVE_ORDER.filter(k => !data.done[k] && q[k])) {
        try {
          const j = await svc.overpass(q[k], null, 0);
          if (k === "streets") data.streets = SRC.shopStreets(j.elements || []);
          else data.els.push(...SRC.slim(j.elements || []));
          data.done[k] = true;
          cacheData(key, data);
        } catch {}
      }
      if (!data.done.voyage) { try { data.voyage = await svc.voyage(geo.en || geo.local); data.done.voyage = true; cacheData(key, data); } catch {} }
      if (data.els.length && Object.keys(data.fame?.n || {}).length < SRC.fameIds(data.els).length * 0.8) { try { data.fame = await svc.fame(data.els, null, data.voyage); cacheData(key, data); } catch {} }
    }
  }
  async function loadData(geo, R, signal, onStep) {
    const city = CITIES.findCity(geo.slug || geo.en || geo.local || geo.name);
    if (city && km(city, geo) < 15) {
      try {
        const d = await readyCity(city.slug);
        if (signal?.aborted) throw { code: "cancelled" };
        if (d?.els?.length) return { ...d, els: [...d.els], source: "ready" };
      } catch (e) { if (e?.code === "cancelled") throw e; }
    }
    const key = `${geo.lat.toFixed(2)},${geo.lng.toFixed(2)}`;
    const q = SRC.buildQueries(geo.lat, geo.lng, R);
    const cached = cachedData(key);
    if (cached?.els?.length || cached?.voyage?.length) {
      const complete = LIVE_ORDER.every(k => cached.done?.[k]) && cached.done?.voyage;
      if (complete) return { ...cached, source: "cache" };
      // a previous visit got only part of the city: try to complete it now, but never wait more than 9 seconds
      await Promise.race([fillLater(key, cached, q, geo, R), new Promise(r => setTimeout(r, 9000))]);
      if (signal?.aborted) throw { code: "cancelled" };
      const now = cachedData(key) || cached;
      return { ...now, source: LIVE_ORDER.every(k => now.done?.[k]) ? "cache" : "partial" };
    }

    const data = { els: [], voyage: [], wiki: { he: [], en: [] }, streets: [] };
    const done = { voyage: false, wiki: false };
    /* the main server allows about two queries at a time per visitor, so queue them: restaurants first, so every day has meals */
    const order = LIVE_ORDER.filter(k => q[k]);
    let qi = 0;
    const worker = async () => {
      while (qi < order.length) {
        const k = order[qi++];
        try {
          const j = await svc.overpass(q[k], signal, 0);
          if (k === "streets") data.streets = SRC.shopStreets(j.elements || []);
          else data.els.push(...SRC.slim(j.elements || []));
          done[k] = true; onStep?.(k);
        }
        catch { if (signal?.aborted) return; failed[k] = true; }
      }
    };
    const failed = {};
    const jobs = [
      worker(), worker(),
      svc.voyage(geo.en || geo.local, signal).then(v => { data.voyage = v; done.voyage = true; }),
      Promise.all([svc.wikiGeo("he", geo.lat, geo.lng, R * 1.2, signal), svc.wikiGeo("en", geo.lat, geo.lng, R * 1.2, signal)]).then(([he, en]) => { data.wiki = { he, en }; done.wiki = true; })
    ].map(p => p.catch(() => {}));
    const all = Promise.all(jobs);
    const enough = () => (done.sights || done.wiki) && (done.restaurants || done.voyage);
    // wait for everything, but stop waiting after 9 seconds once we have enough to plan a trip
    const t0 = Date.now();
    await new Promise(resolve => {
      all.then(resolve);
      const tick = setInterval(() => {
        if (signal?.aborted) { clearInterval(tick); resolve(); return; }
        const el = Date.now() - t0;
        // meals make the days: wait for the restaurants (the slow servers often answer them after 10–20 seconds)
        const meals = done.restaurants || failed.restaurants;
        if ((el > 9000 && enough() && meals) || (el > 22000 && (data.els.length || data.voyage.length || data.wiki.he.length)) || el > 30000) { clearInterval(tick); resolve(); }
      }, 300);
      all.then(() => clearInterval(tick));
    });
    if (signal?.aborted) throw { code: "cancelled" };
    // which sights are famous: a few quick Wikidata calls, never more than 4 seconds
    if (data.els.length) data.fame = await Promise.race([svc.fame(data.els, signal, data.voyage).catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))]) || { n: {}, he: {} };
    const complete = LIVE_ORDER.every(k => done[k] || !q[k]) && done.voyage;
    const save = () => { if (data.els.length || data.voyage.length) cacheData(key, { ...data, done: { ...done } }); };
    save();
    // whatever is still on its way is saved when it arrives; anything that failed is fetched again next time
    if (!complete) all.then(() => { save(); if (!(LIVE_ORDER.every(k => done[k] || !q[k]) && done.voyage)) fillLater(key, { ...data, done: { ...done } }, q, geo, R); });
    return { ...data, els: [...data.els], source: complete ? "live" : "partial" };
  }

  /* ---------- main entry ----------
     build() returns as soon as the places are chosen; hydrate() adds names, stories, photos, routes and AI later. */
  /* Tripadvisor ratings and prices for the popular hotels of each ready city (collected ahead of time, see data/ta) */
  /* local sunset time in minutes after midnight (NOAA approximation), for a trip day */
  function sunsetLocal(geo, start, dayIdx) {
    try {
      const d = start ? new Date(start + "T12:00:00Z") : new Date(Date.now() + 21 * 864e5);
      d.setUTCDate(d.getUTCDate() + dayIdx);
      const r = Math.PI / 180, N = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
      const g = 2 * Math.PI / 365 * (N - 1);
      const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      const ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(geo.lat * r) * Math.cos(decl)) - Math.tan(geo.lat * r) * Math.tan(decl)) / r;
      const utcMin = 720 - 4 * (geo.lng - ha) - eq;
      // the city's clock: its time zone when known, otherwise by longitude
      let off = Math.round(geo.lng / 15) * 60;
      if (geo.tz) {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: geo.tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
        const h = +parts.find(p => p.type === "hour").value, m = +parts.find(p => p.type === "minute").value;
        off = h * 60 + m - (d.getUTCHours() * 60 + d.getUTCMinutes());
        if (off > 840) off -= 1440; if (off < -720) off += 1440;
      }
      const v = Math.round(utcMin + off);
      return isFinite(v) && v > 900 && v < 1320 ? v : null;
    } catch { return null; }
  }
  /* the traveler's own words: lift what they asked for, push down what they did not want, and find the places they named */
  const ROOFTOP = /rooftop|roof ?top|terrazz|terrace|terraza|azotea|sky ?bar|dachterr|teras/i;
  const WINE = /wine|enotec|vinote|bodeg|wein|vino|cave à|bar à vin/i;
  function applyWish(w, pool, geo, data, aliases = []) {
    const lc = LOCAL_CUISINE[geo.cc] || [];
    // one bath for the trip (a visit takes hours): the best known one
    const bath = w.baths ? pool.filter(p => p.bath && !["food", "night", "sleep"].includes(p.cat)).sort((a, b) => (b.fame || 0) - (a.fame || 0) || b.q - a.q)[0] : null;
    for (const p of pool) {
      if (w.boost[p.kind]) p.q += w.boost[p.kind];
      const cu = (p.cuisine || "").toLowerCase();
      if (p.kind === "restaurant" || p.kind === "cafe") {
        if (w.likeCuisine.some(c => cu.includes(c))) p.q += 4;
        if (w.dislikeCuisine.some(c => cu.includes(c))) p.q -= 8;
        if (w.local && lc.some(c => cu.includes(c))) p.q += 2;
        if (w.cheapFood && /pizza|kebab|sandwich|street|noodle|falafel|crepe|taco|gyros|souvlaki/.test(cu)) p.q += 2;
      }
      if (w.rooftop && (p.cat === "night" || p.cat === "food" || p.kind === "view") && ROOFTOP.test(p.local || "")) p.q += 6;
      if (w.wine && (p.cat === "night" || p.kind === "deli") && (WINE.test(p.local || "") || /wine/.test(cu))) p.q += 5;
      if (w.jewish && p.jewish) p.q += 8;
      if (p === bath) p.q += 12;
      if (w.free && p.fee === "yes") p.q -= 3;
      if (w.kids) { if (["zoo", "themepark", "park", "beach"].includes(p.kind)) p.q += 2; if (p.kind === "bar" || p.kind === "club") p.q -= 6; }
      if (w.offbeat && !["food", "night", "sleep"].includes(p.cat)) { p.q -= Math.min(8, (p.fame || 0) / 10); if (p.voyage) p.q += 2; }
      if (w.famous && p.fame) p.q += Math.min(8, p.fame / 10);
      if (w.avoid.includes(p.kind)) p.q -= 20;
    }
    // places they named, matched by Hebrew, local and English names
    const cityNames = [geo.name, geo.local, geo.en];
    const items = pool.filter(p => p.cat !== "sleep").map(p => ({ p, names: [p.name, p.local, p.en, p._he], fame: p.fame || 0 }));
    const opt = { skip: w.ruleWords };
    /* famous places and neighborhoods by the Hebrew names travelers write (data/he-names.json), matched first; their words
       are then taken out of the text, so "מגדל טוקיו" does not also pick some other tower */
    // only the part of the text with what they want: "כבר היינו בסגרדה פמיליה" must not put it in the trip
    let text = Masa.intent.norm([w.wantText ?? w.text, ...(w.aiWant || [])].join(" , "));
    const byAlias = [];
    const al = aliases.map(([he, local, kind, lat, lng, area, tag]) => ({ names: he.split("|"), local, kind: KIND[kind] ? kind : "attraction", lat, lng, area: !!area, tag, fame: 60 }));
    const useAlias = a => {
      const same = x => x && normName(x) === normName(a.local);
      const near = pool.find(p => !["food", "night", "sleep"].includes(p.cat) && km(p, a) < 0.3 && (same(p.local) || same(p.en)));
      const p = near || { id: `he/${geo.slug}/${a.local}`, src: "alias", name: a.names[0], local: a.local, kind: a.kind, cat: KIND[a.kind].cat, lat: a.lat, lng: a.lng, dist: km(geo, a), q: 6, area: a.area, signals: [] };
      if (!near) pool.push(p);
      else if (!/[א-ת]/.test(p.name || "")) p.name = a.names[0]; // "東京タワー" is shown as "מגדל טוקיו"
      p._alias = a.names; p._tag = a.tag; byAlias.push(p);
      for (const n of a.names) text = (" " + text + " ").split(Masa.intent.norm(n)).join(" ").trim();
    };
    /* these names are matched as whole phrases (with ו/ב/ל/ה before them), longest first: "מגדל בלם" before "בלם", and
       a name with the city in it ("טירת פראג") is never matched by the city's name alone */
    const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const phrase = v => new RegExp(`(?:^| )(?:את )?[ובלהמש]{0,2}${reEsc(v)}(?= |$)`);
    const cand = al.flatMap(a => a.names.map(n => ({ a, v: Masa.intent.norm(n) }))).filter(x => x.v.length >= 2).sort((x, y) => y.v.length - x.v.length);
    /* what they have already seen or do not want: out of the pool, with its twins on the map (the basilica and its
       museum, two objects for one tower), so no day, swap or suggestion brings it back */
    const skipped = [];
    const skipNames = [...(w.skips || []), ...(w.aiSkip || [])];
    if (skipNames.length) {
      const st = Masa.intent.norm(skipNames.join(" , "));
      const out = new Set();
      const drop = p => { if (!p || out.has(p)) return; out.add(p); };
      for (const { a, v } of cand) if (phrase(v).test(st)) pool.filter(p => km(p, a) < 0.3 && !["food", "sleep"].includes(p.cat)).forEach(drop), skipped.push(a.names[0]);
      for (const n of skipNames) { const o = Masa.intent.findPlaces(n, items, cityNames)[0]; if (o) { drop(o.it.p); skipped.push(o.it.p.name); } }
      for (const p of [...out]) if (!["food", "sleep", "night"].includes(p.cat)) pool.filter(x => x !== p && !["food", "sleep"].includes(x.cat) && (km(x, p) < 0.12 || (km(x, p) < 0.6 && similar(x.local, p.local)))).forEach(drop);
      for (let i = pool.length - 1; i >= 0; i--) if (out.has(pool[i])) pool.splice(i, 1);
      for (let i = items.length - 1; i >= 0; i--) if (out.has(items[i].p)) items.splice(i, 1);
    }
    for (const { a, v } of cand) if (!byAlias.some(p => p._alias === a.names) && phrase(v).test(text) && !w.avoid.includes(a.kind) && !skipped.includes(a.names[0])) useAlias(a);
    // football without a stadium's name: the city's main stadium
    const footballMiss = w.football && !byAlias.some(p => p._tag === "football" || /stadi|στάδιο|arena|אצטדיון|ארנה/i.test(`${p.local} ${p.name}`)) && !(() => { const a = al.find(x => x.tag === "football"); if (a) useAlias(a); return a; })();
    // a kind they said they do not want is not picked by its name alone ("Montmartre" is the hill, not the Montmartre Museum)
    let found = Masa.intent.findPlaces(text, items.filter(i => !w.avoid.includes(i.p.kind)), cityNames, opt).map(o => o.it.p);
    // not on the map under that name: a Hebrew Wikipedia article at that spot can stand in
    const wikiItems = (data.wiki?.he || []).filter(x => !WIKI_SKIP.test(x.title) && km(geo, x) < 15).map(x => ({ x, names: [x.title], fame: 25 }));
    found.unshift(...byAlias);
    for (const o of Masa.intent.findPlaces(text, wikiItems, cityNames, opt)) {
      const x = o.it.x;
      if (found.some(p => km(p, x) < 0.25)) continue;
      const near = pool.find(p => !["food", "night", "sleep"].includes(p.cat) && km(p, x) < 0.12);
      if (near) { found.push(near); continue; }
      const kind = wikiKind(x.title), clean = x.title.replace(/\s*\([^)]*\)\s*$/, "");
      const p = { id: `wiki/he/${x.pageid}`, src: "wiki", name: clean, local: clean, kind, cat: KIND[kind].cat, lat: x.lat, lng: x.lng, _he: x.title, dist: km(geo, x), q: 6, signals: [] };
      pool.push(p); found.push(p);
    }
    found = found.filter((p, i) => found.findIndex(o => o.id === p.id) === i);
    found.forEach(p => { p.userMust = true; p.q += 25; if (!p.signals?.includes("ביקשתם")) p.signals = ["ביקשתם", ...(p.signals || [])]; });
    // phrases after "לראות", "לבקר ב" that matched nothing: said back to the traveler
    const missed = (w.asks || []).filter(a => !byAlias.some(p => p._alias.some(n => Masa.intent.norm(a).includes(Masa.intent.norm(n)))) && !Masa.intent.findPlaces(a, found.map(p => ({ names: [p.name, p.local, p.en, p._he, ...(p._alias || [])], fame: 30 })), cityNames).length
      && !Masa.intent.findPlaces(a, items.filter(i => !found.includes(i.p)).map(i => ({ ...i, fame: 0 })), cityNames).length);
    // a name that is not famous (a restaurant, a shop): every word they wrote is in its name, or it sounds the same in Hebrew
    for (const a of [...missed]) {
      const o = Masa.intent.looseFind(a, items.filter(i => !found.includes(i.p)))[0];
      if (!o) continue;
      const p = o.p;
      p.userMust = true; p.q += 25; if (!p.signals?.includes("ביקשתם")) p.signals = ["ביקשתם", ...(p.signals || [])];
      found.push(p); missed.splice(missed.indexOf(a), 1);
    }
    // the hotel they already booked
    let hotel = null, hotelMissed = null;
    if (w.hotelName) {
      const hs = pool.filter(p => p.cat === "sleep").map(p => ({ p, names: [p.name, p.local, p.en], fame: p.ta ? 30 : 0 }));
      const h = Masa.intent.findPlaces(w.hotelName, hs, cityNames)[0];
      if (h) { const p = h.it.p; hotel = { id: p.id, name: p.name, local: p.local, kind: p.kind, lat: p.lat, lng: p.lng, stars: p.stars, priceClass: p.priceClass, website: p.website, phone: p.phone, address: p.address, signals: p.signals, q: p.q }; }
      else hotelMissed = w.hotelName;
    }
    if (footballMiss) missed.push("אצטדיון כדורגל");
    // said back as they wrote it, plus the names we found for them
    const N = Masa.intent.norm, said = [];
    for (const n of [...(w.skips || []), ...(w.aiSkipShow || [])]) if (!said.some(x => N(x).includes(N(n)) || N(n).includes(N(x)))) said.push(n);
    const skippedSaid = [...new Set([...said, ...skipped.filter(n => ![...said, ...skipNames].some(k => Masa.intent.norm(n).includes(Masa.intent.norm(k)) || Masa.intent.norm(k).includes(Masa.intent.norm(n))))])].slice(0, 8);
    return { places: found, missed, hotel, hotelMissed, skipped: skippedSaid };
  }
  /* ---------- "I'll choose": the city's best places by kind, for the traveler to pick from ---------- */
  const PICK_GROUPS = [
    ["must", "המקומות שכולם מגיעים אליהם", null],
    ["art", "מוזיאונים ואמנות", ["museum", "gallery"]],
    ["view", "תצפיות ונוף", ["view", "bridge"]],
    ["history", "היסטוריה ואדריכלות", ["sight", "church", "square", "attraction"]],
    ["nature", "פארקים, גנים וחופים", ["park", "beach", "zoo", "themepark"]],
    ["taste", "שווקים, קינוחים ובתי קפה", ["market", "deli", "dessert", "bakery", "cafe"]],
    ["food", "המסעדות שאנחנו ממליצים", ["restaurant"]],
    ["shop", "רחובות קניות", ["street"]],
    ["night", "ברים ובילוי", ["bar", "club"]]
  ];
  async function candidates(opts, signal) {
    const city = CITIES.findCity(opts.query);
    const geo = city ? { lat: city.lat, lng: city.lng, name: city.he, local: city.local, en: city.en, country: city.country, cc: city.cc, slug: city.slug, tz: city.tz, R: city.R } : await svc.geocode(opts.query, signal);
    if (!geo) throw { code: "not_found" };
    opts.onGeo?.(geo);
    let R = geo.R || 3000;
    if (!geo.R && geo.bbox) R = Math.min(4000, Math.max(1800, km({ lat: geo.bbox.s, lng: geo.bbox.w }, { lat: geo.bbox.n, lng: geo.bbox.e }) * 1000 / 4.5));
    const data = await loadData(geo, R, signal);
    if (!data.els.length && !data.voyage.length) throw { code: "network" };
    const { pool } = buildPool(data, geo);
    pool.forEach(p => rate(p, geo.cc, opts.budget, opts.mobility || ""));
    const MUSTK = ["attraction", "sight", "museum", "view", "church", "park", "square", "bridge"];
    const taken = new Set(), out = [];
    const short = p => ({ id: p.id, name: p._he && /[\u0590-\u05FF]/.test(p._he) && !["food", "night", "shopping"].includes(p.cat) ? p._he.replace(/\s*\([^)]*\)\s*$/, "") : p.name, local: p.local, kind: p.kind, cat: p.cat, lat: p.lat, lng: p.lng, q: p.q, fame: p.fame || 0,
      why: p.kind === "street" ? streetWhy(p) : WHY[p.kind] || "", signals: (p.signals || []).slice(0, 2), wikidata: p.wikidata || null, _he: p._he || null, _en: p._en || null, website: p.website || null, cuisine: p.cuisine || null, voyage: p.voyage ? { text: p.voyage.text, priceClass: p.voyage.priceClass } : null });
    const far = p => p.dist > Math.max(2.5, R / 1000 * 1.3) && (p.fame || 0) < 40;
    for (const [key, he, kinds] of PICK_GROUPS) {
      // recommended restaurants: only ones with a real sign of quality (a star, a guide, a known name), no chains
      const goodFood = p => p.kind !== "restaurant" || ((p.michelin || p.voyage || p.wikidata || (p.fame || 0) > 0) && !p.brand && !CHAIN.test(p.local || ""));
      const list = pool.filter(p => !taken.has(p.id) && !far(p) && goodFood(p) && (kinds ? kinds.includes(p.kind) : MUSTK.includes(p.kind) && p.q >= 6))
        .sort((a, b) => b.q - a.q);
      const items = [];
      for (const p of list) {
        if (items.length >= (key === "must" ? 14 : key === "food" ? 12 : 10)) break;
        // the same landmark twice (two map objects, or a museum inside it) shows once
        if (items.some(o => km(o, p) < 0.12 || (km(o, p) < 0.6 && similar(o.local, p.local)))) continue;
        items.push(p); taken.add(p.id);
      }
      if (items.length) out.push({ key, he, items: items.map(short) });
    }
    return { geo, groups: out };
  }
  /* a light index of a ready city's named places, for showing which named places were recognized while the traveler types */
  /* a ready city's file is fetched once per visit and shared: the wishes preview, the build and a rebuild all use it */
  const READY = {};
  const readyCity = slug => READY[slug] || (READY[slug] = svc.getJSON(`data/cities/${slug}.json`, {}, 15000).then(d => { if (!d?.els?.length) throw new Error("empty"); return d; }).catch(e => { delete READY[slug]; throw e; }));
  /* start loading while the traveler is still choosing (called when a destination is picked) */
  const prefetch = q => { const c = CITIES.findCity(q || ""); if (c) readyCity(c.slug).catch(() => {}); loadTA(); };
  let HEN = null;
  const heNames = () => HEN || (HEN = svc.getJSON("data/he-names.json", {}, 8000).then(d => d || {}).catch(() => { HEN = null; return {}; }));
  const wishIdx = {};
  /* the city's hotels from its ready data, for the "where do you sleep" field */
  const hotelIdx = {};
  function hotelIndex(slug) {
    if (!slug) return Promise.resolve([]);
    return hotelIdx[slug] || (hotelIdx[slug] = readyCity(slug).then(d => (d.els || []).filter(e => e.tags?.name && KIND[kindFromTags(e.tags)]?.cat === "sleep").map(e => {
      const t = e.tags, c = e.center || e;
      return { id: `${e.type}/${e.id}`, name: t["name:he"] || t.name, local: t.name, kind: kindFromTags(t), lat: +c.lat, lng: +c.lon, address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "), stars: +t.stars || null };
    }).filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lng))).catch(() => []));
  }
  /* every named place of a ready city (restaurants and shops too), for the "I have places" suggestions */
  const placeIdx = {};
  function placeIndex(slug) {
    if (!slug) return Promise.resolve([]);
    return placeIdx[slug] || (placeIdx[slug] = readyCity(slug).then(d => {
      const F = d.fame || {};
      return (d.els || []).filter(e => e.tags?.name).map(e => {
        const t = e.tags, c = e.center || e, kind = kindFromTags(t);
        if (!KIND[kind] || KIND[kind].cat === "sleep") return null;
        // a statue or a memorial borrows its fame from the person it shows: not a place to plan around
        const statue = /^(memorial|monument|statue|tomb|grave)$/.test(t.historic || "") || t.memorial || t.tourism === "artwork";
        const he = t["name:he"] || (!statue && t.wikidata && F.he?.[t.wikidata]) || "";
        // a name in a script the traveler cannot read (天守台, Χατζής) is shown in Latin letters when there is one
        const shown = he || (/^[\u0000-\u024F\s\p{P}\d]+$/u.test(t.name) ? t.name : t["name:en"] || t["name:latin"] || t.name);
        return { id: `${e.type}/${e.id}`, names: [t.name, t["name:en"], he], he: shown, name: shown, statue: !!statue, local: t.name, kind, cat: KIND[kind].cat, lat: +c.lat, lng: +(c.lon ?? c.lng), fame: (!statue && t.wikidata && F.n?.[t.wikidata]) || 0, address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") };
      }).filter(x => x && Number.isFinite(x.lat) && Number.isFinite(x.lng));
    }).catch(() => []));
  }
  /* the neighborhoods travelers know by a Hebrew name (data/he-names.json), to name a place to sleep */
  const heAreas = slug => heNames().then(d => (d[slug] || []).filter(r => r[5] && Number.isFinite(+r[3]) && Number.isFinite(+r[4])).map(r => ({ name: r[0].split("|")[0], lat: +r[3], lng: +r[4] }))).catch(() => []);
  function wishIndex(slug) {
    if (!slug) return Promise.resolve(null);
    return wishIdx[slug] || (wishIdx[slug] = Promise.all([readyCity(slug), heNames()]).then(([d, hen]) => {
      const F = d.fame || {};
      const out = [];
      for (const e of d.els || []) {
        const t = e.tags || {};
        if (!t.name) continue;
        const kind = kindFromTags(t);
        if (KIND[kind].cat === "sleep") continue;
        const fame = (t.wikidata && F.n?.[t.wikidata]) || 0;
        if (!fame && !t["name:he"] && !t.tourism && !t.historic) continue;
        out.push({ names: [t["name:he"], t.name, t["name:en"], t.wikidata && F.he?.[t.wikidata]], fame, he: t["name:he"] || (t.wikidata && F.he?.[t.wikidata]) || t.name });
      }
      for (const x of d.wiki?.he || []) if (!WIKI_SKIP.test(x.title)) out.push({ names: [x.title], fame: 25, he: x.title.replace(/\s*\([^)]*\)\s*$/, "") });
      for (const [he] of hen[slug] || []) out.unshift({ names: he.split("|"), fame: 60, he: he.split("|")[0] });
      return out;
    }).catch(() => null));
  }
  let TA = null;
  /* Tripadvisor ratings were collected ahead of time here until 27.10. Their terms allow keeping only location ids, so the
     stored ratings were removed; hotel ratings come back live (js/ratings.js) once there is an agreement and a key. */
  const loadTA = () => TA || (TA = Promise.resolve({}));
  async function build(opts, step, signal) {
    const { query, days, budget, pace } = opts;
    const interests = opts.interests.length ? opts.interests : ["food", "history", "view"];
    const chk = () => { if (signal?.aborted) throw { code: "cancelled" }; };

    step(0);
    let geo = opts.geo;
    if (!geo) {
      const city = CITIES.findCity(query);
      geo = city ? { lat: city.lat, lng: city.lng, name: city.he, local: city.local, en: city.en, country: city.country, cc: city.cc, slug: city.slug, tz: city.tz, R: city.R } : await svc.geocode(query, signal);
    }
    if (!geo) throw { code: "not_found" };
    chk();
    opts.onGeo?.(geo);

    step(1);
    let R = geo.R || 3000;
    if (!geo.R && geo.bbox) R = Math.min(4000, Math.max(1800, km({ lat: geo.bbox.s, lng: geo.bbox.w }, { lat: geo.bbox.n, lng: geo.bbox.e }) * 1000 / 4.5));
    const data = await loadData(geo, R, signal);
    chk();
    if (!data.els.length && !data.voyage.length && !(data.wiki?.he?.length || data.wiki?.en?.length)) throw { code: "network" };

    step(2);
    const ta = (await loadTA())[CITIES.findCity(geo.slug || geo.en || geo.name)?.slug] || null;
    const { pool, noGeo } = buildPool({ ...data, ta }, geo);
    let hotel = opts.hotel && hasXY(opts.hotel) ? opts.hotel : null;
    if (hotel) pool.forEach(p => { p.dist = 0.3 * p.dist + 0.7 * km(hotel, p); });
    const mobility = opts.mobility || "";
    pool.forEach(p => rate(p, geo.cc, budget, mobility));
    // memory: places this traveler already visited give way to new ones; cuisines they liked get a small lift
    if (opts.visited?.length) {
      const V = new Set(opts.visited.map(x => String(x).toLowerCase()));
      pool.forEach(p => { if (V.has(String(p.id).toLowerCase()) || V.has(String(p.local || "").toLowerCase())) { p.q -= 6; p.seen = true; } });
    }
    if (opts.likeCuisines?.length) pool.forEach(p => { if (p.kind === "restaurant" && opts.likeCuisines.some(c => (p.cuisine || "").includes(c))) p.q += 1; });
    /* what the traveler wrote in their own words */
    /* "I have places": each one is read like "חייבים לראות את ..." in the wishes box, so it is found the same way
       (Hebrew names, the map, Wikipedia) and said back if it was not found; the rest of the trip is our recommendations */
    const mine = (opts.mine || []).map(n => String(n).replace(/[,.;!?\n]/g, " ").trim()).filter(n => n.length >= 2).slice(0, 20);
    const wish = Masa.intent ? Masa.intent.parse([opts.notes || "", ...mine.map(n => `חייבים לראות את ${n}`)].filter(Boolean).join(", ")) : null;
    /* what the smart guide read in the same words (only when it read exactly this text) */
    if (wish && opts.aiWish && opts.aiWish.text === opts.notes) {
      const names = a => (a || []).flatMap(x => [x.name, x.he]).filter(Boolean);
      wish.aiSkip = names(opts.aiWish.skip);
      wish.aiSkipShow = (opts.aiWish.skip || []).map(x => x.he || x.name).filter(Boolean);
      const sk = new Set([...wish.aiSkip, ...wish.skips].map(Masa.intent.norm));
      wish.aiWant = names(opts.aiWish.want).filter(n => !sk.has(Masa.intent.norm(n)));
      if (wish.aiSkip.length || wish.aiWant.length) wish.empty = false;
    }
    const avoid = new Set(wish?.avoid || []);
    /* shopping means shopping streets and markets: a specific shop, a department store or a mall only when the traveler
       asked for one (a mall, outlet, brands) or named it */
    if (!wish?.stores) ["shop", "store", "mall"].forEach(k => avoid.add(k));
    if (!wish?.stores && !wish?.wine) avoid.add("deli");
    // the Hebrew names of famous places count even when nothing else in the text was understood ("לטייל בגראן ויה")
    const aliases = wish && wish.text.trim() && geo.slug ? (await heNames())[geo.slug] || [] : [];
    let wishOut = wish && (!wish.empty || aliases.length) ? applyWish(wish, pool, geo, data, aliases) : null;
    if (wishOut && wish.empty && !wishOut.places.length) wishOut = null;
    /* places the traveler picked on the "I'll choose" screen: each is in the trip, like a place named in the wishes */
    if (opts.picks?.length) {
      const want = new Set(opts.picks);
      const picked = pool.filter(p => want.has(p.id));
      for (const o of opts.pickObjs || []) if (want.has(o.id) && !picked.some(p => p.id === o.id) && hasXY(o)) { const p = { ...o, dist: km(geo, o), signals: o.signals || [] }; pool.push(p); picked.push(p); }
      picked.forEach(p => { p.picked = true; if (!p.userMust) { p.userMust = true; p.q += 25; if (!p.signals?.includes("בחרתם")) p.signals = ["בחרתם", ...(p.signals || [])]; } });
      wishOut = wishOut || { places: [], missed: [], hotel: null };
      picked.forEach(p => { if (!wishOut.places.includes(p)) wishOut.places.push(p); });
    }
    const onlyPicks = !!(opts.picks?.length && opts.onlyPicks);
    /* the hotel written in "where do you sleep": first among the city's hotels, otherwise on the whole map (name or address) */
    const hotelName = String(opts.hotelName || "").trim().slice(0, 120);
    // picked from the suggestions on the goals screen: that exact place, no search needed
    const hp = opts.hotelPick;
    if (hotelName && hp && hp.name === hotelName && Number.isFinite(+hp.lat) && Number.isFinite(+hp.lng) && km(geo, { lat: +hp.lat, lng: +hp.lng }) < 40 && !wishOut?.hotel) {
      wishOut = wishOut || { places: [], missed: [], hotel: null };
      // the same hotel in our list (for its stars and website): close by AND with the same name, never just the one next door
      // ("Hotel Artemide" and "Hotel La Griffe" share only the word "hotel": compare what is left)
      const core = n => normName(n).replace(/\b(hotel|hotels|hostel|albergo|hotel|residence|residenza|suites?|inn|apartments?|b b|bnb|the|le|la|il|de|di|del|des)\b/g, " ").replace(/\s+/g, " ").trim();
      const want = core(hp.local || hp.name);
      const p = want ? pool.find(x => x.cat === "sleep" && km(x, { lat: +hp.lat, lng: +hp.lng }) < 0.15 && core(x.local) && (core(x.local) === want || core(x.local).includes(want) || want.includes(core(x.local)))) : null;
      wishOut.hotel = p ? { id: p.id, name: p.name, local: p.local, kind: p.kind, lat: p.lat, lng: p.lng, stars: p.stars, priceClass: p.priceClass, website: p.website, phone: p.phone, address: p.address, signals: p.signals || [], q: p.q }
        : { id: String(hp.id || "pick").slice(0, 60), name: String(hp.name).slice(0, 120), local: String(hp.local || hp.name).slice(0, 120), kind: ["hotel", "hostel", "apartment", "guest_house", "motel"].includes(hp.kind) ? hp.kind : "hotel", lat: +hp.lat, lng: +hp.lng, address: String(hp.address || "").slice(0, 160), signals: [] };
    }
    if (hotelName && !hotel && !wishOut?.hotel) {
      const hs = pool.filter(p => p.cat === "sleep").map(p => ({ p, names: [p.name, p.local], fame: p.fame || 0 }));
      const h = Masa.intent ? Masa.intent.findPlaces(hotelName, hs, [geo.name, geo.local, geo.en].filter(Boolean))[0] : null;
      wishOut = wishOut || { places: [], missed: [], hotel: null };
      if (h) { const p = h.it.p; wishOut.hotel = { id: p.id, name: p.name, local: p.local, kind: p.kind, lat: p.lat, lng: p.lng, stars: p.stars, priceClass: p.priceClass, website: p.website, phone: p.phone, address: p.address, signals: p.signals || [], q: p.q }; }
      else { wishOut.hotelMissed = hotelName; wishOut.hotelAddr = true; }
    }
    // their hotel is not on our list: look it up on the whole map (a few seconds at most)
    if (wishOut?.hotelMissed && !hotel) {
      try {
        const r = await Promise.race([svc.searchNear(wishOut.hotelMissed, geo.lat, geo.lng, signal), new Promise(res => setTimeout(() => res([]), 5000))]);
        const x = (r || []).find(x => x.category === "tourism" && /hotel|hostel|guest_house|apartment|motel/.test(x.type) && km(geo, x) < 25);
        if (x) { wishOut.hotel = { id: `${x.osmType}/${x.osmId}`, name: x.name, local: x.local, kind: x.type === "hostel" ? "hostel" : "hotel", lat: x.lat, lng: x.lng, address: x.address, signals: [] }; wishOut.hotelMissed = null; }
        // an address (an apartment, a friend's place): where they sleep is that spot
        else if (wishOut.hotelAddr) {
          const y = (r || []).find(x => km(geo, x) < 25);
          if (y) { wishOut.hotel = { id: `${y.osmType}/${y.osmId}`, name: wishOut.hotelMissed, local: y.local || y.name, kind: "apartment", lat: y.lat, lng: y.lng, address: y.address, signals: [] }; wishOut.hotelMissed = null; }
        }
      } catch {}
      chk();
    }
    // places they named that are not in our lists (a neighborhood like Montmartre): look them up on the whole map
    if (wishOut?.missed?.length) {
      // Nominatim allows one request a second: ask one at a time, and give up after 6 seconds in total
      const res = [], t0 = Date.now();
      const many = (opts.mine || []).length ? 8 : 3, budgetMs = (opts.mine || []).length ? 9000 : 4500;
      for (const [i, a] of wishOut.missed.slice(0, many).entries()) {
        if (Date.now() - t0 > budgetMs) break;
        if (i) await new Promise(ok => setTimeout(ok, 1100));
        // "וינווד" is found on the map as "Wynwood": the name the smart guide read for it, when there is one
        const en = (opts.aiWish?.want || []).find(x => x.name && x.he && (Masa.intent.norm(x.he) === Masa.intent.norm(a) || Masa.intent.norm(a).includes(Masa.intent.norm(x.he))))?.name;
        const r = await Promise.race([svc.searchNear(en || a, geo.lat, geo.lng, signal).catch(() => []), new Promise(ok => setTimeout(() => ok([]), Math.max(1500, budgetMs + 1500 - (Date.now() - t0))))]);
        res.push({ a, r });
        if (signal?.aborted) break;
      }
      chk();
      for (const { a, r } of res) {
        // any kind of place: a restaurant, a café, a bar, a shop, a bakery, a sight or a neighborhood (not a road or a hotel)
        const x = (r || []).find(x => km(geo, x) < 20 && !["highway", "railway", "office", "landuse"].includes(x.category) && !/hotel|hostel|apartment|guest_house|motel/.test(x.type));
        if (!x) continue;
        const area = x.category === "place" || x.category === "boundary";
        const kind = area ? "sight" : searchKind(x.category, x.type, x.name);
        const p = { id: `${x.osmType}/${x.osmId}`, src: "search", name: x.name, local: x.local, kind, cat: KIND[kind].cat, lat: x.lat, lng: x.lng, dist: km(geo, x), q: 30, userMust: true, area, signals: ["ביקשתם"] };
        pool.push(p); wishOut.places.push(p); wishOut.missed = wishOut.missed.filter(m => m !== a);
      }
    }
    if (wishOut?.hotel && !hotel) { hotel = wishOut.hotel; pool.forEach(p => { p.dist = 0.3 * p.dist + 0.7 * km(hotel, p); }); }
    // less walking: places close to each other and to the center matter twice as much
    if (mobility) pool.forEach(p => { p.dist *= 2; });
    /* stay in the heart of the city: inside the core a place costs little for its distance; beyond it, each km costs more.
       A truly famous place far out (Sagrada Família, the Eiffel Tower) still makes it thanks to its fame. */
    const move = MOVE[opts.move] ? opts.move : "walk";
    const M = MOVE[move];
    const core = Math.max(0.9, (geo.R || R || 3000) / 1000 * M.core);
    const centralR = Math.max(0.9, (geo.R || R || 3000) / 1000 * 0.4); // the walkable heart of the city
    pool.forEach(p => { p.out = Math.max(0, p.dist - core); p.cpen = p.dist * (move === "car" ? 0.15 : 0.6) + M.out * p.out; });
    if (opts.diet === "כשר") pool.forEach(p => { if (p.cat === "food") p.q += p.kosher ? 8 : -1; });
    if (opts.diet === "צמחוני") pool.forEach(p => { if (p.cat === "food") p.q += p.veg ? 3 : /vegetarian|vegan/.test(p.cuisine || "") ? 4 : 0; });
    if (opts.diet === "טבעוני") pool.forEach(p => { if (p.cat === "food") p.q += isVegan(p) ? 4 : 0; });
    const by = kinds => pool.filter(p => kinds.includes(p.kind) && (!avoid.has(p.kind) || p.userMust)).sort((a, b) => (b.q - b.cpen) - (a.q - a.cpen));

    /* The perfect mix: chosen interests get most of the day, the rest still appear a little,
       and every day gets at least one of the city's must-see places. */
    const perDay = Math.max(3, ({ "רגוע": 3, "מאוזן": 4, "אינטנסיבי": 5 }[pace] || 4) - (["wheelchair", "walking"].includes(opts.mobility) ? 1 : 0));
    const maxReach = opts.mobility && move === "walk" ? 1.2 : M.reach; // how far from the day's main place
    const wantFood = interests.includes("food"), wantNight = interests.includes("night");
    const W = {};
    const chosenActs = interests.filter(c => !["food", "night"].includes(c));
    const sprinkle = chosenActs.length ? 0.35 : 0.7;
    for (const c of ["history", "art", "view", "nature", "shopping", "family", "food"]) W[c] = interests.includes(c) ? 3 : ["history", "view", "art", "nature"].includes(c) ? sprinkle : 0;
    // food lives mostly in the meals; as an activity it only leads when it is the main thing chosen
    if (wantFood) W.food = chosenActs.length ? 0.8 : 4;
    const MUST = ["attraction", "sight", "museum", "view", "church", "park", "square", "bridge"];
    /* 1. one anchor per day: the city's must-see places, spread apart so each day covers its own area */
    const mustPool = by(MUST).filter(p => p.q >= 6);
    // the places the traveler named come first: each one opens a day, and ones close to each other share a day
    // (a market they named, "שוק קמדן", is a place to visit too, not only a food stop)
    const userMusts = (wishOut?.places || []).filter(p => !["food", "night", "sleep"].includes(p.cat) || p.kind === "market");
    /* "I'll build it myself": places the traveler put on a day stay on that day; the day's best one is its main place */
    const dayOf = p => { const v = opts.pickDays?.[p.id]; return Number.isInteger(v) && v >= 0 && v < days ? v : -1; };
    const fixedAnchor = Array.from({ length: days }, (_, d) => userMusts.filter(p => dayOf(p) === d).sort((a, b) => b.q - a.q)[0] || null);
    const freeMusts = userMusts.filter(p => dayOf(p) < 0);
    const anchors = fixedAnchor.some(Boolean) ? (() => {
      const free = pickFor(freeMusts, Math.min(fixedAnchor.filter(x => !x).length, freeMusts.length), fixedAnchor.filter(Boolean), Math.max(0.6, M.gap * 0.7));
      const more = onlyPicks ? [] : pickFor(mustPool.filter(p => !userMusts.includes(p)), fixedAnchor.filter(x => !x).length - free.length, [...fixedAnchor.filter(Boolean), ...free], M.gap);
      const fill = [...free, ...more];
      return fixedAnchor.map(a => a || fill.shift()).filter(Boolean);
    })() : pickFor(userMusts, Math.min(days, userMusts.length), [], Math.max(0.6, M.gap * 0.7));
    if (!onlyPicks && anchors.length < days) anchors.push(...pickFor(mustPool, days - anchors.length, anchors, M.gap));
    const extraMusts = userMusts.filter(p => !anchors.includes(p));
    if (anchors.length < days) anchors.push(...pickFor(by([...MUST, ...Object.keys(W).filter(c => W[c] > 0).flatMap(c => SLOT_KINDS[c])]), days - anchors.length, anchors, M.gap * 0.7));
    anchors.forEach(p => { if (p.q >= 6) p.must = true; });
    if (!anchors.length) throw { code: "too_few" };
    const used = new Set(anchors.map(p => p.id));
    /* the same landmark often appears twice (the Colosseum as a building and as a site, "Prague Castle" and "Pražský hrad"):
       once one is in the trip, its twins are out */
    const SIGHTY = new Set(["sight", "church", "attraction", "museum", "view", "square", "bridge", "park", "gallery"]);
    const markTwins = x => {
      if (!SIGHTY.has(x.kind)) return;
      for (const p of pool) {
        if (used.has(p.id) || !SIGHTY.has(p.kind) || p.picked || (p.userMust && !(x.userMust && similar(p.local, x.local)))) continue;
        const d = km(x, p);
        if (d < 0.12 || (d < 0.45 && (p.fame || 0) >= 25 && (x.fame || 0) >= 25) || (d < 1 && similar(p.local, x.local))) used.add(p.id);
      }
    };
    anchors.forEach(markTwins);
    /* 2. activity mix per day, by the weights */
    const perDayActs = Math.max(1, perDay - (wantFood ? 1 : 0) - 1);
    const totalW = Object.values(W).reduce((a, b) => a + b, 0) || 1;
    /* split all activity slots of the trip by weight, then spread each category over the days */
    const totalSlots = perDayActs * anchors.length;
    const shares = Object.entries(W).filter(([, w]) => w > 0).map(([c, w]) => ({ c, exact: totalSlots * w / totalW }));
    shares.forEach(x => { x.n = Math.floor(x.exact); });
    let left = totalSlots - shares.reduce((a, x) => a + x.n, 0);
    shares.sort((x, y) => (y.exact - y.n) - (x.exact - x.n)).forEach(x => { if (left > 0) { x.n++; left--; } });
    const quotaFor = d => shares.map((x, ci) => ({ c: x.c, n: Math.floor(x.n / anchors.length) + ((d + ci) % anchors.length < x.n % anchors.length ? 1 : 0) }));
    const kindCount = {};
    /* diet first: kosher or vegetarian travelers get a matching restaurant even if it is a bit farther */
    const dietOk = p => opts.diet === "כשר" ? p.kosher : opts.diet === "טבעוני" ? isVegan(p) : opts.diet === "צמחוני" ? (p.veg || /vegetarian|vegan/.test(p.cuisine || "")) : true;
    let dietRest = null;
    const mealPick = (anchor, near, far, extra) => {
      if (opts.diet && opts.diet !== "הכול") {
        dietRest = dietRest || anyRestaurants.filter(dietOk);
        const d = nearBest(dietRest, anchor, opts.diet === "כשר" ? 3.5 : 1.5, extra);
        if (d) return d;
        const any = nearBest(restaurants, anchor, near, extra) || nearBest(restaurants, anchor, far, extra) || nearBest(anyRestaurants, anchor, near, extra);
        if (any) any._dietMiss = true;
        return any;
      }
      return nearBest(restaurants, anchor, near, extra) || nearBest(restaurants, anchor, far, extra) || nearBest(anyRestaurants, anchor, near, extra) || nearBest(anyRestaurants, anchor, far, extra);
    };
    // named places that did not get a day of their own join the day whose main place is nearest
    const extraOf = anchors.map(() => []);
    extraMusts.forEach(p => {
      if (anchors.includes(p) || extraOf.some(g => g.includes(p))) return;
      let bi = 0;
      anchors.forEach((a, i) => { if (km(a, p) < km(anchors[bi], p)) bi = i; });
      const fixed = dayOf(p); if (fixed >= 0 && fixed < anchors.length) bi = fixed;
      extraOf[bi].push(p); used.add(p.id); markTwins(p);
    });
    const satDay = d => { if (!wish?.shabbat || !opts.start) return false; const x = new Date(opts.start + "T12:00:00"); x.setDate(x.getDate() + d); return x.getDay() === 6; };
    const groups = anchors.map((anchor, d) => {
      const dayPick = [anchor, ...extraOf[d]];
      kindCount[anchor.kind] = (kindCount[anchor.kind] || 0) + 1;
      /* a day out at a far landmark stays out there: everything is chosen around it, not on the way back to the center */
      // the same rule for every way of moving: a day in the center stays in the center, a day out stays out
      const farDay = anchor.dist > centralR + 0.8;
      const reachToday = farDay ? Math.min(maxReach, move === "car" ? 3 : 2) : maxReach;
      const outCost = p => farDay ? 0 : (move === "car" ? 0.6 : move === "transit" ? 1.2 : 2.5) * Math.max(0, p.dist - centralR);
      const tooFar = p => farDay ? km(anchor, p) > reachToday : p.dist > centralR + 0.8 && (p.fame || 0) < 40;
      const quota = quotaFor(d).filter(x => !(satDay(d) && x.c === "shopping"));
      let budget = onlyPicks ? 0 : Math.max(extraOf[d].length ? 1 : 0, perDayActs - extraOf[d].length);
      for (const { c, n } of quota.sort((x, y) => W[y.c] - W[x.c])) {
        for (let k = 0; k < n && budget > 0; k++) {
          const kinds = c === "food" && chosenActs.length ? ["market", "deli", "bakery"] : SLOT_KINDS[c];
          const cands = by(kinds).filter(p => !used.has(p.id));
          let best = null, bv = -Infinity;
          for (const p of cands) {
            const dk = km(anchor, p);
            if (tooFar(p)) continue; // far from the center and not famous enough to be worth the trip
            if (dk > reachToday || dayPick.some(o => km(o, p) < (c === "shopping" ? 0.25 : 0.12))) continue;
            const sameDay = dayPick.filter(o => o.kind === p.kind).length;
            const v = p.q - M.dk * dk - outCost(p) - 3 * sameDay - 0.6 * (kindCount[p.kind] || 0);
            if (v > bv) { bv = v; best = p; }
          }
          if (!best) break;
          used.add(best.id); markTwins(best); dayPick.push(best); budget--;
          kindCount[best.kind] = (kindCount[best.kind] || 0) + 1;
        }
      }
      // fill any empty slots with the best nearby place from the chosen interests
      const fillKinds = [...new Set(Object.keys(W).filter(c => W[c] > 0 && !(satDay(d) && c === "shopping")).flatMap(c => SLOT_KINDS[c]))];
      while (budget > 0) {
        let best = null, bv = -Infinity;
        for (const p of by(fillKinds)) {
          if (used.has(p.id) || tooFar(p) || km(anchor, p) > reachToday + 0.5 || dayPick.some(o => km(o, p) < 0.12)) continue;
          const v = p.q - M.dk * km(anchor, p) - outCost(p) - 3 * dayPick.filter(o => o.kind === p.kind).length;
          if (v > bv) { bv = v; best = p; }
        }
        if (!best) break;
        used.add(best.id); markTwins(best); dayPick.push(best); budget--;
      }
      const ordered = orderDay(dayPick, hotel);
      // a sunset: end the day's sights at a viewpoint
      if (wish?.sunset) {
        const vi = ordered.findIndex(p => p.kind === "view" || p.kind === "bridge");
        const last = ordered[ordered.length - 1];
        if (vi >= 0 && vi < ordered.length - 1 && km(ordered[vi], last) < 1.5) ordered.push(ordered.splice(vi, 1)[0]);
        else if (vi < 0) {
          const v = by(["view", "bridge"]).find(p => !used.has(p.id) && km(last, p) < 1.2);
          if (v) { used.add(v.id); markTwins(v); ordered.push(v); }
        }
        const end = ordered[ordered.length - 1];
        if (end.kind === "view" || end.kind === "bridge") end._sunset = true;
      }
      return ordered;
    });
    /* a place kind they asked for by name (a beach, a zoo, a market) is in the trip at least once */
    for (const [k, v] of Object.entries(wish?.boost || {})) {
      if (v < 5 || groups.some(g => g.some(p => p.kind === k))) continue;
      let best = null, bv = -Infinity, bd = 0;
      for (const p of by([k])) {
        if (used.has(p.id)) continue;
        groups.forEach((g, i) => {
          const d = Math.min(...g.map(x => km(x, p)));
          const v2 = p.q - d * (move === "car" ? 0.5 : 1.5);
          if (d < Math.max(3, maxReach * 2) && v2 > bv) { bv = v2; best = p; bd = i; }
        });
      }
      if (best) {
        used.add(best.id); markTwins(best);
        const g = orderDay([...groups[bd], best], hotel), si = g.findIndex(p => p._sunset);
        if (si >= 0) g.push(g.splice(si, 1)[0]);
        groups[bd] = g;
      }
    }
    const act = Object.keys(W).filter(c => W[c] > 0);

    /* restaurants with a real sign of quality come first: a Michelin star, a Wikivoyage recommendation, a known place
       (Wikipedia), or a local kitchen that keeps its details up to date. Others are used only when none of these is near. */
    const goodRest = p => p.michelin || p.voyage || p.wikidata || (p.fame || 0) > 0 || (p.website && p.hours && (p.cuisine || "").length > 0 && (LOCAL_CUISINE[geo.cc] || []).some(c => (p.cuisine || "").includes(c)));
    const allRestaurants = by(["restaurant"]).filter(p => !p.brand && !CHAIN.test(p.local || ""));
    const restaurants = allRestaurants.filter(goodRest);
    const anyRestaurants = allRestaurants;
    const cafes = by(["cafe", "bakery"]);
    const treats = by(["dessert", "market", "deli", "bakery"]); // "deli" only when asked (see avoid above)
    const kosherFood = opts.diet === "כשר" ? by(["cafe", "bakery", "dessert"]).filter(p => p.kosher && !p.brand) : null; // breakfast: places open in the morning
    const bars = by(["bar", "club"]);
    const cuisinesUsed = {};
    const usedNames = new Set(groups.flat().map(p => normName(p.local)));
    const nearBest = (list, anchor, maxKm, extra = () => 0) => {
      let best = null, bv = -Infinity;
      for (const f of list) {
        if (used.has(f.id) || usedNames.has(normName(f.local))) continue; // two branches of the same chain in one trip is one too many
        const d = km(anchor, f);
        if (d > maxKm) continue;
        const cu = (f.cuisine || "").split(";")[0];
        const v = f.q - M.meal * d - (cu ? 1.4 * (cuisinesUsed[cu] || 0) : 0) + extra(f);
        if (v > bv) { bv = v; best = f; }
      }
      if (best) { used.add(best.id); usedNames.add(normName(best.local)); const cu = (best.cuisine || "").split(";")[0]; if (cu) cuisinesUsed[cu] = (cuisinesUsed[cu] || 0) + 1; }
      return best;
    };
    const dinnerBoost = f => (budget === "מפנק" ? (f.michelin ? 3 : 0) + (f.voyage?.priceClass === "splurge" ? 2 : 0) : 0) + (f.voyage ? 1 : 0);


    // a restaurant or bar the traveler named becomes a meal on the nearest day
    const namedMeals = anchors.map(() => ({}));
    (wishOut?.places || []).filter(p => p.cat === "food" || p.cat === "night").forEach(p => {
      if (used.has(p.id)) return;
      let bi = 0;
      groups.forEach((g, i) => { if (Math.min(...g.map(x => km(x, p))) < Math.min(...groups[bi].map(x => km(x, p)))) bi = i; });
      const fixed = dayOf(p); if (fixed >= 0 && fixed < groups.length) bi = fixed;
      const slot = p.cat === "night" ? "drinks" : p.kind === "restaurant" ? (namedMeals[bi].dinner ? "lunch" : "dinner") : "treat";
      if (namedMeals[bi][slot]) {
        // a second restaurant chosen for the same day is lunch, then the other day's free meal
        const alt = slot === "dinner" && !namedMeals[bi].lunch ? "lunch" : null;
        if (!alt) return;
        namedMeals[bi][alt] = p; used.add(p.id); usedNames.add(normName(p.local)); return;
      }
      namedMeals[bi][slot] = p; used.add(p.id); usedNames.add(normName(p.local));
    });
    const dayPlans = groups.map((g, gi) => {
      const named = namedMeals[gi] || {};
      const list = g.map(p => ({ p, meal: null }));
      const first = g[0] || geo, last = g[g.length - 1] || geo;
      if (wantFood) {
        // kosher: breakfast at a kosher place even a bit farther; otherwise the café is marked as not kosher
        const b = (kosherFood && (nearBest(kosherFood, hotel || first, 1.5) || nearBest(kosherFood, first, 2.5)))
          || (hotel && nearBest(cafes, hotel, 0.5)) || nearBest(cafes, first, M.bfast[0]) || nearBest(cafes, first, M.bfast[1]);
        if (b && kosherFood && !b.kosher) b._dietMiss = true;
        if (b) list.unshift({ p: b, meal: "breakfast" });
      }
      const li = list.findIndex((x, i) => i >= Math.ceil(g.length / 2) + (wantFood ? 1 : 0));
      const at = li < 0 ? list.length : li;
      const anchor = list[Math.max(0, at - 1)]?.p || first;
      const lunch = named.lunch || mealPick(anchor, M.lunch[0], M.lunch[1]);
      if (lunch) list.splice(at, 0, { p: lunch, meal: "lunch" });
      if (wantFood && g.length >= 2) {
        const ti = Math.min(list.length, at + 2);
        const dayKinds = new Set(list.map(x => x.p.kind));
        // kosher: a kosher sweet place or a market to walk through first
        const tl = kosherFood ? treats.filter(t => !dayKinds.has(t.kind) && (t.kosher || t.kind === "market")) : null;
        const tr = named.treat || (tl && (nearBest(tl, list[ti - 1]?.p || anchor, 1.5))) || nearBest(treats.filter(t => !dayKinds.has(t.kind)), list[ti - 1]?.p || anchor, 0.8) || nearBest(treats.filter(t => !dayKinds.has(t.kind)), list[ti - 1]?.p || anchor, 1.5);
        if (tr && kosherFood && !tr.kosher && tr.kind !== "market" && !named.treat) tr._dietMiss = true;
        if (tr) list.splice(ti, 0, { p: tr, meal: "treat" });
      }
      const dinner = named.dinner || mealPick(last, M.dinner[0], M.dinner[1], dinnerBoost);
      if (dinner) list.push({ p: dinner, meal: "dinner" });
      if (wantNight) {
        const bar = named.drinks || nearBest(bars, dinner || last, 1.2) || nearBest(bars, dinner || last, 3);
        if (bar) list.push({ p: bar, meal: "drinks" });
      } else if (named.drinks) list.push({ p: named.drinks, meal: "drinks" });
      if (hotel) list.unshift({ p: { ...hotel, id: hotel.id || "hotel" }, meal: "hotel" });
      return list;
    });

    // "also around here": two more places near each activity, matching the chosen interests
    const interestKinds = new Set([...interests.filter(c => SLOT_KINDS[c]).flatMap(c => SLOT_KINDS[c]), ...MUST, ...(wantFood ? ["restaurant", "cafe", "dessert", "market"] : [])]);
    const nearbyOf = new Map();
    for (const { p } of dayPlans.flat()) {
      if (p.cat === "food" || p.cat === "night") continue;
      const cands = pool.filter(x => !used.has(x.id) && interestKinds.has(x.kind) && !avoid.has(x.kind) && km(p, x) < 0.9)
        .sort((a, b) => (b.q - 2 * km(p, b)) - (a.q - 2 * km(p, a))).slice(0, 2);
      cands.forEach(c => used.add(c.id));
      nearbyOf.set(p.id, cands);
    }
    const idea = p => ({ name: p.name, local: p.local, cat: p.cat, kind: p.kind, lat: p.lat, lng: p.lng, why: p.voyage?.text || WHY[p.kind] || "", website: p.website || null, wikidata: p.wikidata || null, _wd: p.wikidata || null, _wiki: p.wikiTag || null, _he: p._he || null, _en: p._en || null });
    const rest = pool.filter(p => !used.has(p.id)).sort((a, b) => b.q - a.q);
    const take = (f, n) => { const out = []; for (const p of rest) { if (out.length >= n) break; if (!used.has(p.id) && f(p)) { out.push(p); used.add(p.id); } } return out; };
    const disc = {
      gems: take(p => (p.voyage || p.wikidata) && ["sight", "museum", "church", "view", "gallery"].includes(p.kind) && p.tourism !== "attraction", 4),
      experiences: take(p => ["street", "market", "mall", "bar", "zoo", "themepark", "deli"].includes(p.kind) && p.q > 2, 4),
      free: take(p => ["view", "park", "church", "beach"].includes(p.kind) && p.fee !== "yes", 3)
    };

    const ranked = pool.filter(p => p.q > -3).sort((a, b) => b.q - a.q);
    const placeList = [...ranked.filter(p => p.cat !== "sleep").slice(0, 800), ...ranked.filter(p => p.cat === "sleep").slice(0, 250)].map(toPlace);
    const trip = {
      city: geo.name, slug: geo.slug || null, cityLocal: geo.local, cityEn: geo.en || geo.local, country: geo.country, cc: geo.cc, tz: geo.tz || null, lat: geo.lat, lng: geo.lng,
      source: "osm", dataSource: data.source, createdAt: Date.now(), pending: true,
      opts: { query, days, budget, pace, diet: opts.diet || "הכול", mobility: opts.mobility || "", move, notes: opts.notes || "", ...(mine.length ? { mine } : {}), interests, start: opts.start || null, people: opts.people || 2,
        ...(opts.picks?.length ? { picks: opts.picks, onlyPicks: !!opts.onlyPicks, pickDays: opts.pickDays || null, pickObjs: (opts.pickObjs || []).map(o => ({ id: o.id, name: o.name, local: o.local, kind: o.kind, cat: o.cat, lat: o.lat, lng: o.lng, q: o.q, signals: o.signals || [] })) } : {}) },
      hotel: hotel ? { ...hotel } : null,
      summary: "",
      days: dayPlans.map((list, i) => {
        const stops = list.map(({ p, meal }) => { const s = toStop(p, budget, meal); if (p.must && !meal) s.must = true;
          if (p.userMust) { s.asked = true; s.must = true; }
          if (p._sunset) { s.tip = "הגיעו בערך 20 דקות לפני השקיעה. זה המקום לסיים בו את היום."; s.sunset = true; }
          if (p._dietMiss && (meal === "breakfast" || meal === "treat") && opts.diet === "כשר") { s.tip = "המקום הזה לא מסומן ככשר: לא מצאנו כשר מסומן קרוב. אפשר לעצור כאן רק לשתייה, או לאכול במלון."; s.notKosher = true; }
          if (p._dietMiss && (meal === "lunch" || meal === "dinner") && opts.diet === "כשר") s.notKosher = true;
          if (p._dietMiss && (meal === "lunch" || meal === "dinner")) s.tip = opts.diet === "כשר" ? kosherMissTip(p) : opts.diet === "טבעוני" ? "לא מצאנו מסעדה טבעונית מסומנת קרוב למסלול. כדאי לשאול על מנות טבעוניות." : "לא מצאנו מסעדה צמחונית מסומנת קרוב למסלול. רוב המסעדות מציעות מנות צמחוניות, כדאי לשאול.";
          s.nearby = (nearbyOf.get(p.id) || []).map(idea); return s; });
        const cats = [...new Set(stops.filter(s => !s.meal).map(s => s.cat))].slice(0, 2).map(c => CATS[c]?.he).filter(Boolean);
        const d = { label: `יום ${i + 1}`, theme: cats.join(" ו") || "אוכל ושיטוט", stops, route: null, legs: null, move };
        if (wish?.start) d.startMin = wish.start;
        if (wish?.sunset) d.sunsetMin = sunsetLocal(geo, opts.start, i);
        if (satDay(i)) { d.shabbat = true; d.theme = "שבת · " + d.theme; }
        optimizeDay(d);
        assignTimes(d);
        return d;
      }).filter(d => d.stops.length),
      places: placeList,
      voyageNoGeo: noGeo.filter(v => ["eat", "drink", "buy"].includes(v.type)).slice(0, 60).map(v => ({ name: v.name, kind: v.kind, cat: v.cat, price: v.price, priceClass: v.priceClass, vtext: v.content, website: v.url, hours: v.hours, address: v.address })),
      discover: {
        gems: disc.gems.map(idea), experiences: disc.experiences.map(idea), free: disc.free.map(idea), daytrips: [],
        dishes: [], phrases: PHRASES[COUNTRY_LANG[geo.cc] || "en"], etiquette: ETIQUETTE_GENERIC
      }
    };
    function kosherMissTip(p) {
      const syn = pool.filter(x => x.jewish).map(x => ({ x, d: km(p, x) })).sort((a, b) => a.d - b.d)[0];
      return `לא מצאנו מסעדה כשרה מסומנת קרוב למסלול של היום. ברשימת המסעדות אפשר לסנן לפי כשר.${syn ? ` בית הכנסת הקרוב: ${syn.x.local} (${syn.d < 1 ? Math.round(syn.d * 1000) + " מטר" : syn.d.toFixed(1) + " ק״מ"}). שם בדרך כלל יודעים להפנות לאוכל כשר.` : " כדאי לבדוק גם בבית חב״ד המקומי."}`;
    }
    const n = trip.days.reduce((a, d) => a + d.stops.length, 0);
    const meals = trip.days.reduce((a, d) => a + d.stops.filter(s => s.meal).length, 0);
    // a wish for baths in a city where we found none is told as not found, not as done
    const bathIds = new Set(pool.filter(p => p.bath).map(p => p.id));
    const noBath = wish?.baths && !trip.days.some(d => d.stops.some(s => bathIds.has(s.osm)));
    if (wishOut && noBath) wishOut.missed = [...wishOut.missed, "מרחץ תרמי או חמאם"];
    if (wishOut) trip.wish = {
      labels: wish.labels.filter(l => !(noBath && l.startsWith("מרחצאות")) && !(wishOut.missed.includes("אצטדיון כדורגל") && l.startsWith("כדורגל"))),
      places: trip.days.flatMap((d, di) => d.stops.filter(s => s.asked || (s.meal && wishOut.places.some(p => p.id === s.osm))).map(s => ({ name: s.name, day: di }))),
      missed: wishOut.missed, hotel: wishOut.hotel ? wishOut.hotel.name : null, hotelMissed: wishOut.hotelMissed || null, skipped: wishOut.skipped || []
    };
    const moveWord = { walk: "מסלול הליכה", transit: "מסלול עם תחבורה ציבורית", car: "מסלול ברכב" }[move] || "מסלול";
    trip.summary = `${moveWord} לכל יום, ${meals ? "עם ארוחות בדרך, " : ""}לפי מה שבחרתם: ${interests.map(i => CATS[i]?.he).filter(Boolean).join(", ")}.`;
    return trip;
  }

  /* Fill in the slow parts in the background. onUpdate(stage) lets the screen refresh as they arrive. */
  async function hydrate(trip, onUpdate) {
    const stops = trip.days.flatMap(d => d.stops);
    const ideas = [...stops.flatMap(s => s.nearby || []), ...["gems", "experiences", "free"].flatMap(k => trip.discover[k] || [])];
    const routes = Promise.all(trip.days.map(d => computeRoute(d))).then(() => onUpdate("routes"));
    const wd = await svc.wikidata([...stops.map(s => s.wikidata), ...ideas.map(i => i._wd)].filter(Boolean));
    const SIGHT = ["history", "art", "view", "nature", "family", "religion"];
    const apply = (o, id, wikiTag) => {
      const e = id && wd[id];
      if (e?.labelHe && SIGHT.includes(o.cat)) o.name = e.labelHe;
      o._he = e?.hewiki || o._he || null; o._en = e?.enwiki || o._en || null;
      const wt = (wikiTag || "").match(/^(he|en):(.+)$/);
      if (wt && !o["_" + wt[1]]) o["_" + wt[1]] = wt[2];
      return e;
    };
    stops.forEach(s => { const e = apply(s, s.wikidata, s._wikiTag); if (e?.descHe && s.whyLang !== "en") s.why = e.descHe.replace(/^./, c => c.toUpperCase()).replace(/\.?$/, "."); });
    ideas.forEach(i => { const e = apply(i, i._wd, i._wiki); if (e?.descHe && !i.why) i.why = e.descHe.replace(/\.?$/, "."); });
    onUpdate("names");
    await svc.mapLimit(stops, 5, async s => {
      const sum = (s._he && await svc.wikiSummary("he", s._he)) || (s._en && await svc.wikiSummary("en", s._en));
      if (sum) {
        if (!s.histAI) { s.history = firstSentences(sum.extract, 700); s.histLang = sum.lang; }
        s.wikiUrl = sum.url;
        s.image = sum.image;
        onUpdate("story");
      }
    });
    await routes;
    if (Masa.ai.enabled()) {
      onUpdate("ai-start");
      try { await enrichWithAI(trip, trip.opts || {}); }
      catch (e) { trip.aiError = e.code || "ai_error"; }
    }
    trip.pending = false;
    onUpdate("done");
    return trip;
  }
  const firstSentences = (text, max) => {
    if (!text) return "";
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("׃ "));
    return i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + "…";
  };

  /* The AI only writes text about places that already exist on the map. It never adds coordinates. */
  async function enrichWithAI(trip, opts) {
    const stops = trip.days.flatMap((d, di) => d.stops.map(s => ({ s, di })));
    const list = stops.map(({ s, di }, i) => ({ i, day: di + 1, name: s.name, local: s.local, kind: s.kind, meal: s.meal, cuisine: s.cuisine, source: (s.history || (s.whyLang === "en" ? s.why : "") || "").slice(0, 300) }));
    const prompt = `You are an expert local tour guide, food critic and historian in ${trip.cityEn || trip.cityLocal}, ${trip.country}. A traveler plans ${trip.days.length} days. Interests: ${(opts.interests || []).join(", ")}. Budget: ${opts.budget}. Pace: ${opts.pace}. Notes from the traveler: ${opts.notes || "none"}.
These are REAL places already on the route (from OpenStreetMap and Wikivoyage). "source" is a Wikipedia or Wikivoyage excerpt when available; use it as the factual basis and do not invent facts you are not sure about. For restaurants, describe what they are known for only if you actually know; otherwise describe the cuisine and what to order there.
${JSON.stringify(list)}

Write everything in natural Hebrew. Reply with only JSON:
{"summary":"1-2 sentences about this trip, addressing the traveler's notes",
 "days":[{"theme":"short theme for each day, in order"}],
 "stops":[{"i":0,"why":"one sentence why to go","history":"2-4 sentences: the real story like a guide speaking. For a restaurant, café or market: what it is known for and what to order","fact":"one surprising true sentence","tip":"one practical tip","best":"best time to visit, short","busy":[16 integers 0-100, typical crowd per hour 07:00..22:00, 0=closed],"booking_needed":true,"booking_steps":["2-4 short steps; name the official seller, never invent URLs"]}],
 "dishes":[6 x {"name":"Hebrew","local":"local name","why":"one sentence"}],
 "experiences":[3 x {"name":"Hebrew","local":"local name for web search","why":"one sentence"}],
 "daytrips":[2 x {"name":"Hebrew","local":"local name","why":"one sentence including travel time"}],
 "etiquette":[4 short local customs tips]}`;
    const r = await Masa.ai.json(prompt);
    if (r.summary) trip.summary = r.summary;
    (r.days || []).forEach((d, i) => { if (trip.days[i] && d?.theme) trip.days[i].theme = d.theme; });
    (r.stops || []).forEach(x => {
      const ref = stops[+x.i];
      if (!ref) return;
      const s = ref.s;
      if (x.why) { s.why = x.why; s.whyLang = "he"; }
      if (x.history && (!s.history || s.histLang !== "he")) { s.history = x.history; s.histLang = "he"; s.histAI = true; }
      if (x.fact) s.fact = x.fact;
      if (x.tip) s.tip = x.tip;
      if (x.best) s.best = x.best;
      if (Array.isArray(x.busy) && x.busy.length >= 12) { s.busy = Array.from({ length: 16 }, (_, k) => Math.max(0, Math.min(100, Math.round(+x.busy[k] || 0)))); s.busySrc = "ai"; }
      if (Array.isArray(x.booking_steps) && x.booking_steps.length) s.booking = { ...s.booking, needed: !!x.booking_needed || s.booking.needed, steps: x.booking_steps.map(String) };
    });
    const D = trip.discover;
    if (Array.isArray(r.dishes)) D.dishes = r.dishes.slice(0, 6);
    if (Array.isArray(r.experiences)) D.experiences = [...D.experiences, ...r.experiences.map(x => ({ ...x, cat: "food", lat: null, lng: null }))].slice(0, 6);
    if (Array.isArray(r.daytrips)) D.daytrips = r.daytrips.map(x => ({ ...x, cat: "nature", lat: null, lng: null }));
    if (Array.isArray(r.etiquette) && r.etiquette.length) D.etiquette = r.etiquette.slice(0, 5);
    trip.ai = true;
  }

  return { candidates, optimizeDay, prefetch, wishIndex, hotelIndex, placeIndex, heAreas, searchKind, legMinutes, MOVE, build, hydrate, computeRoute, assignTimes, km, isOpen, KIND, PRICE_SIGN, MEAL, rate };
})();
