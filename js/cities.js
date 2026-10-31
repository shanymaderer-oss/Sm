/* מסע · popular cities. Their map data is fetched ahead of time by a GitHub Action
   (tools/fetch-cities.mjs → data/cities/<slug>.json), so these trips load almost instantly. */
(function (root) {
  const TZ = {"rome": "Europe/Rome", "paris": "Europe/Paris", "barcelona": "Europe/Madrid", "london": "Europe/London", "prague": "Europe/Prague", "budapest": "Europe/Budapest", "vienna": "Europe/Vienna", "berlin": "Europe/Berlin", "amsterdam": "Europe/Amsterdam", "lisbon": "Europe/Lisbon", "porto": "Europe/Lisbon", "madrid": "Europe/Madrid", "athens": "Europe/Athens", "milan": "Europe/Rome", "florence": "Europe/Rome", "venice": "Europe/Rome", "new-york": "America/New_York", "bangkok": "Asia/Bangkok", "tokyo": "Asia/Tokyo", "istanbul": "Europe/Istanbul",
    "batumi": "Asia/Tbilisi", "tbilisi": "Asia/Tbilisi", "larnaca": "Asia/Nicosia", "limassol": "Asia/Nicosia", "paphos": "Asia/Nicosia", "nice": "Europe/Paris", "munich": "Europe/Berlin",
    "dubai": "Asia/Dubai", "krakow": "Europe/Warsaw", "warsaw": "Europe/Warsaw", "sofia": "Europe/Sofia", "bucharest": "Europe/Bucharest", "thessaloniki": "Europe/Athens", "naples": "Europe/Rome",
    "belgrade": "Europe/Belgrade", "dublin": "Europe/Dublin", "edinburgh": "Europe/London", "copenhagen": "Europe/Copenhagen", "seville": "Europe/Madrid", "valencia": "Europe/Madrid",
    "miami": "America/New_York", "los-angeles": "America/Los_Angeles", "las-vegas": "America/Los_Angeles", "san-francisco": "America/Los_Angeles", "chicago": "America/Chicago", "toronto": "America/Toronto", "stockholm": "Europe/Stockholm", "oslo": "Europe/Oslo", "helsinki": "Europe/Helsinki", "reykjavik": "Atlantic/Reykjavik", "zurich": "Europe/Zurich", "geneva": "Europe/Zurich", "salzburg": "Europe/Vienna", "innsbruck": "Europe/Vienna", "hamburg": "Europe/Berlin", "frankfurt": "Europe/Berlin", "cologne": "Europe/Berlin", "brussels": "Europe/Brussels", "riga": "Europe/Riga", "vilnius": "Europe/Vilnius", "tallinn": "Europe/Tallinn", "ljubljana": "Europe/Ljubljana", "zagreb": "Europe/Zagreb", "split": "Europe/Zagreb", "dubrovnik": "Europe/Zagreb", "bratislava": "Europe/Bratislava", "bologna": "Europe/Rome", "verona": "Europe/Rome", "palermo": "Europe/Rome", "malaga": "Europe/Madrid", "granada": "Europe/Madrid", "rhodes": "Europe/Athens", "heraklion": "Europe/Athens", "antalya": "Europe/Istanbul", "abu-dhabi": "Asia/Dubai", "phuket": "Asia/Bangkok", "chiang-mai": "Asia/Bangkok", "singapore": "Asia/Singapore", "seoul": "Asia/Seoul", "kyoto": "Asia/Tokyo", "osaka": "Asia/Tokyo", "hanoi": "Asia/Ho_Chi_Minh", "mexico-city": "America/Mexico_City", "marrakech": "Africa/Casablanca", "tirana": "Europe/Tirane", "yerevan": "Asia/Yerevan", "baku": "Asia/Baku"};
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
    C("valencia", "ולנסיה", "Valencia", "València", "ספרד", "es", 39.4720, -0.3770, 2600),
    // added 31.10.2026: more places Israelis fly to
    C("miami", "מיאמי", "Miami", "Miami", "ארה״ב", "us", 25.7850, -80.1650, 5000),
    C("los-angeles", "לוס אנג׳לס", "Los Angeles", "Los Angeles", "ארה״ב", "us", 34.0800, -118.3200, 5000),
    C("las-vegas", "לאס וגאס", "Las Vegas", "Las Vegas", "ארה״ב", "us", 36.1147, -115.1728, 3500),
    C("san-francisco", "סן פרנסיסקו", "San Francisco", "San Francisco", "ארה״ב", "us", 37.7955, -122.4100, 3500),
    C("chicago", "שיקגו", "Chicago", "Chicago", "ארה״ב", "us", 41.8830, -87.6300, 3500),
    C("toronto", "טורונטו", "Toronto", "Toronto", "קנדה", "ca", 43.6510, -79.3830, 3500),
    C("stockholm", "שטוקהולם", "Stockholm", "Stockholm", "שוודיה", "se", 59.3290, 18.0680, 3000),
    C("oslo", "אוסלו", "Oslo", "Oslo", "נורווגיה", "no", 59.9130, 10.7400, 2600),
    C("helsinki", "הלסינקי", "Helsinki", "Helsinki", "פינלנד", "fi", 60.1690, 24.9400, 2600),
    C("reykjavik", "רייקיאוויק", "Reykjavik", "Reykjavík", "איסלנד", "is", 64.1460, -21.9420, 2200),
    C("zurich", "ציריך", "Zurich", "Zürich", "שווייץ", "ch", 47.3730, 8.5420, 2600),
    C("geneva", "ז׳נבה", "Geneva", "Genève", "שווייץ", "ch", 46.2040, 6.1460, 2400),
    C("salzburg", "זלצבורג", "Salzburg", "Salzburg", "אוסטריה", "at", 47.8000, 13.0440, 2200),
    C("innsbruck", "אינסברוק", "Innsbruck", "Innsbruck", "אוסטריה", "at", 47.2680, 11.3930, 2200),
    C("hamburg", "המבורג", "Hamburg", "Hamburg", "גרמניה", "de", 53.5500, 9.9930, 3200),
    C("frankfurt", "פרנקפורט", "Frankfurt", "Frankfurt am Main", "גרמניה", "de", 50.1110, 8.6820, 2600),
    C("cologne", "קלן", "Cologne", "Köln", "גרמניה", "de", 50.9390, 6.9580, 2600),
    C("brussels", "בריסל", "Brussels", "Bruxelles", "בלגיה", "be", 50.8470, 4.3520, 2800),
    C("riga", "ריגה", "Riga", "Rīga", "לטביה", "lv", 56.9490, 24.1050, 2400),
    C("vilnius", "וילנה", "Vilnius", "Vilnius", "ליטא", "lt", 54.6870, 25.2800, 2400),
    C("tallinn", "טאלין", "Tallinn", "Tallinn", "אסטוניה", "ee", 59.4370, 24.7450, 2200),
    C("ljubljana", "לובליאנה", "Ljubljana", "Ljubljana", "סלובניה", "si", 46.0510, 14.5060, 2000),
    C("zagreb", "זאגרב", "Zagreb", "Zagreb", "קרואטיה", "hr", 45.8130, 15.9770, 2400),
    C("split", "ספליט", "Split", "Split", "קרואטיה", "hr", 43.5080, 16.4400, 2000),
    C("dubrovnik", "דוברובניק", "Dubrovnik", "Dubrovnik", "קרואטיה", "hr", 42.6410, 18.1080, 2000),
    C("bratislava", "ברטיסלבה", "Bratislava", "Bratislava", "סלובקיה", "sk", 48.1440, 17.1100, 2200),
    C("bologna", "בולוניה", "Bologna", "Bologna", "איטליה", "it", 44.4940, 11.3430, 2200),
    C("verona", "ורונה", "Verona", "Verona", "איטליה", "it", 45.4390, 10.9930, 2000),
    C("palermo", "פלרמו", "Palermo", "Palermo", "איטליה", "it", 38.1160, 13.3620, 2400),
    C("malaga", "מלגה", "Malaga", "Málaga", "ספרד", "es", 36.7200, -4.4200, 2400),
    C("granada", "גרנדה", "Granada", "Granada", "ספרד", "es", 37.1770, -3.5960, 2200),
    C("rhodes", "רודוס", "Rhodes", "Ρόδος", "יוון", "gr", 36.4440, 28.2240, 2200),
    C("heraklion", "הרקליון", "Heraklion", "Ηράκλειο", "יוון", "gr", 35.3390, 25.1330, 2200),
    C("antalya", "אנטליה", "Antalya", "Antalya", "טורקיה", "tr", 36.8870, 30.7030, 3000),
    C("abu-dhabi", "אבו דאבי", "Abu Dhabi", "أبوظبي", "איחוד האמירויות", "ae", 24.4700, 54.3700, 4000),
    C("phuket", "פוקט", "Phuket", "ภูเก็ต", "תאילנד", "th", 7.8960, 98.2960, 3000),
    C("chiang-mai", "צ׳יאנג מאי", "Chiang Mai", "เชียงใหม่", "תאילנד", "th", 18.7880, 98.9870, 2400),
    C("singapore", "סינגפור", "Singapore", "Singapore", "סינגפור", "sg", 1.2870, 103.8540, 4000),
    C("seoul", "סיאול", "Seoul", "서울", "דרום קוריאה", "kr", 37.5660, 126.9800, 4000),
    C("kyoto", "קיוטו", "Kyoto", "京都", "יפן", "jp", 35.0050, 135.7700, 3500),
    C("osaka", "אוסקה", "Osaka", "大阪", "יפן", "jp", 34.6800, 135.5000, 3500),
    C("hanoi", "האנוי", "Hanoi", "Hà Nội", "וייטנאם", "vn", 21.0300, 105.8520, 2500),
    C("mexico-city", "מקסיקו סיטי", "Mexico City", "Ciudad de México", "מקסיקו", "mx", 19.4320, -99.1400, 4000),
    C("marrakech", "מרקש", "Marrakech", "مراكش", "מרוקו", "ma", 31.6290, -7.9890, 2600),
    C("tirana", "טירנה", "Tirana", "Tiranë", "אלבניה", "al", 41.3280, 19.8180, 2200),
    C("yerevan", "ירוואן", "Yerevan", "Երևան", "ארמניה", "am", 40.1810, 44.5140, 2400),
    C("baku", "באקו", "Baku", "Bakı", "אזרבייג׳ן", "az", 40.3700, 49.8370, 2600)
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
