/* מסע · popular cities. Their map data is fetched ahead of time by a GitHub Action
   (tools/fetch-cities.mjs → data/cities/<slug>.json), so these trips load almost instantly. */
(function (root) {
  const TZ = {"rome": "Europe/Rome", "paris": "Europe/Paris", "barcelona": "Europe/Madrid", "london": "Europe/London", "prague": "Europe/Prague", "budapest": "Europe/Budapest", "vienna": "Europe/Vienna", "berlin": "Europe/Berlin", "amsterdam": "Europe/Amsterdam", "lisbon": "Europe/Lisbon", "porto": "Europe/Lisbon", "madrid": "Europe/Madrid", "athens": "Europe/Athens", "milan": "Europe/Rome", "florence": "Europe/Rome", "venice": "Europe/Rome", "new-york": "America/New_York", "bangkok": "Asia/Bangkok", "tokyo": "Asia/Tokyo", "istanbul": "Europe/Istanbul",
    "batumi": "Asia/Tbilisi", "tbilisi": "Asia/Tbilisi", "larnaca": "Asia/Nicosia", "limassol": "Asia/Nicosia", "paphos": "Asia/Nicosia", "nice": "Europe/Paris", "munich": "Europe/Berlin",
    "dubai": "Asia/Dubai", "krakow": "Europe/Warsaw", "warsaw": "Europe/Warsaw", "sofia": "Europe/Sofia", "bucharest": "Europe/Bucharest", "thessaloniki": "Europe/Athens", "naples": "Europe/Rome",
    "belgrade": "Europe/Belgrade", "dublin": "Europe/Dublin", "edinburgh": "Europe/London", "copenhagen": "Europe/Copenhagen", "seville": "Europe/Madrid", "valencia": "Europe/Madrid"};
  const C = (slug, he, en, local, country, cc, lat, lng, R) => ({ slug, he, en, local, country, cc, lat, lng, R, tz: TZ[slug] });
  const CITIES = [
    C("rome", "רומא", "Rome", "Roma", "איטליה", "it", 41.8986, 12.4769, 3200),
    C("paris", "פריז", "Paris", "Paris", "צרפת", "fr", 48.8589, 2.3469, 3800),
    C("barcelona", "ברצלונה", "Barcelona", "Barcelona", "ספרד", "es", 41.3874, 2.1686, 3200),
    C("london", "לונדון", "London", "London", "בריטניה", "gb", 51.5101, -0.1280, 4000),
    C("prague", "פראג", "Prague", "Praha", "צ׳כיה", "cz", 50.0865, 14.4210, 2800),
    C("budapest", "בודפשט", "Budapest", "Budapest", "הונגריה", "hu", 47.4979, 19.0490, 3000),
    C("vienna", "וינה", "Vienna", "Wien", "אוסטריה", "at", 48.2066, 16.3707, 3000),
    C("berlin", "ברלין", "Berlin", "Berlin", "גרמניה", "de", 52.5190, 13.4000, 4000),
    C("amsterdam", "אמסטרדם", "Amsterdam", "Amsterdam", "הולנד", "nl", 52.3712, 4.8960, 2800),
    C("lisbon", "ליסבון", "Lisbon", "Lisboa", "פורטוגל", "pt", 38.7110, -9.1390, 2800),
    C("porto", "פורטו", "Porto", "Porto", "פורטוגל", "pt", 41.1460, -8.6110, 2400),
    C("madrid", "מדריד", "Madrid", "Madrid", "ספרד", "es", 40.4160, -3.7036, 3000),
    C("athens", "אתונה", "Athens", "Αθήνα", "יוון", "gr", 37.9750, 23.7300, 2800),
    C("milan", "מילאנו", "Milan", "Milano", "איטליה", "it", 45.4642, 9.1900, 2800),
    C("florence", "פירנצה", "Florence", "Firenze", "איטליה", "it", 43.7710, 11.2550, 2000),
    C("venice", "ונציה", "Venice", "Venezia", "איטליה", "it", 45.4380, 12.3330, 1800),
    C("new-york", "ניו יורק", "New York City", "New York", "ארצות הברית", "us", 40.7540, -73.9840, 4000),
    C("bangkok", "בנגקוק", "Bangkok", "กรุงเทพมหานคร", "תאילנד", "th", 13.7500, 100.5000, 4000),
    C("tokyo", "טוקיו", "Tokyo", "東京", "יפן", "jp", 35.6812, 139.7671, 4000),
    C("istanbul", "איסטנבול", "Istanbul", "İstanbul", "טורקיה", "tr", 41.0100, 28.9750, 3200),
    // popular with Israeli travelers
    C("batumi", "בטומי", "Batumi", "ბათუმი", "גאורגיה", "ge", 41.6460, 41.6380, 2200),
    C("tbilisi", "טביליסי", "Tbilisi", "თბილისი", "גאורגיה", "ge", 41.6938, 44.8015, 3000),
    C("larnaca", "לרנקה", "Larnaca", "Λάρνακα", "קפריסין", "cy", 34.9170, 33.6290, 2000),
    C("limassol", "לימסול", "Limassol", "Λεμεσός", "קפריסין", "cy", 34.6786, 33.0413, 2600),
    C("paphos", "פאפוס", "Paphos", "Πάφος", "קפריסין", "cy", 34.7600, 32.4180, 2400),
    C("nice", "ניס", "Nice", "Nice", "צרפת", "fr", 43.6990, 7.2700, 2400),
    C("munich", "מינכן", "Munich", "München", "גרמניה", "de", 48.1374, 11.5755, 3000),
    C("dubai", "דובאי", "Dubai", "دبي", "איחוד האמירויות", "ae", 25.2000, 55.2700, 4000),
    C("krakow", "קרקוב", "Krakow", "Kraków", "פולין", "pl", 50.0614, 19.9372, 2400),
    C("warsaw", "ורשה", "Warsaw", "Warszawa", "פולין", "pl", 52.2370, 21.0175, 3000),
    C("sofia", "סופיה", "Sofia", "София", "בולגריה", "bg", 42.6977, 23.3219, 2600),
    C("bucharest", "בוקרשט", "Bucharest", "București", "רומניה", "ro", 44.4325, 26.1039, 3000),
    C("thessaloniki", "סלוניקי", "Thessaloniki", "Θεσσαλονίκη", "יוון", "gr", 40.6330, 22.9450, 2400),
    C("naples", "נאפולי", "Naples", "Napoli", "איטליה", "it", 40.8460, 14.2550, 2600),
    C("belgrade", "בלגרד", "Belgrade", "Београд", "סרביה", "rs", 44.8160, 20.4600, 2600),
    C("dublin", "דבלין", "Dublin", "Dublin", "אירלנד", "ie", 53.3460, -6.2620, 2600),
    C("edinburgh", "אדינבורו", "Edinburgh", "Edinburgh", "בריטניה", "gb", 55.9500, -3.1900, 2200),
    C("copenhagen", "קופנהגן", "Copenhagen", "København", "דנמרק", "dk", 55.6780, 12.5730, 2600),
    C("seville", "סביליה", "Seville", "Sevilla", "ספרד", "es", 37.3890, -5.9920, 2400),
    C("valencia", "ולנסיה", "Valencia", "València", "ספרד", "es", 39.4720, -0.3770, 2600)
  ];
  /* find a popular city in free text, in Hebrew or English. Whole words only ("ניס" is not inside "ניסיון"),
     allowing a Hebrew prefix letter ("לרומא", "ברומא"). */
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SEP = "[\\s,.;:!?()\"'/-]";
  const RX = new Map();
  const rx = name => { if (!RX.has(name)) RX.set(name, new RegExp(`(^|${SEP})[ובלמה]?${esc(name)}($|${SEP})`, "i")); return RX.get(name); };
  function findCity(q) {
    const t = String(q || "").toLowerCase().trim();
    if (!t) return null;
    // an exact id first ("new-york" has a dash, so the name patterns below would miss it)
    const exact = CITIES.find(c => c.slug === t);
    if (exact) return exact;
    return CITIES.find(c => [c.he, c.en.toLowerCase(), c.local.toLowerCase(), c.slug.replace("-", " ")].some(n => rx(n).test(t))) || null;
  }
  const api = { CITIES, findCity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.Masa = root.Masa || {}; root.Masa.cities = api; }
})(typeof window !== "undefined" ? window : globalThis);
