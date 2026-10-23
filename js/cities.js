/* מסע · popular cities. Their map data is fetched ahead of time by a GitHub Action
   (tools/fetch-cities.mjs → data/cities/<slug>.json), so these trips load almost instantly. */
(function (root) {
  const TZ = {"rome": "Europe/Rome", "paris": "Europe/Paris", "barcelona": "Europe/Madrid", "london": "Europe/London", "prague": "Europe/Prague", "budapest": "Europe/Budapest", "vienna": "Europe/Vienna", "berlin": "Europe/Berlin", "amsterdam": "Europe/Amsterdam", "lisbon": "Europe/Lisbon", "porto": "Europe/Lisbon", "madrid": "Europe/Madrid", "athens": "Europe/Athens", "milan": "Europe/Rome", "florence": "Europe/Rome", "venice": "Europe/Rome", "new-york": "America/New_York", "bangkok": "Asia/Bangkok", "tokyo": "Asia/Tokyo", "istanbul": "Europe/Istanbul"};
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
    C("istanbul", "איסטנבול", "Istanbul", "İstanbul", "טורקיה", "tr", 41.0100, 28.9750, 3200)
  ];
  /* find a popular city in free text, in Hebrew or English */
  function findCity(q) {
    const t = String(q || "").toLowerCase();
    return CITIES.find(c => t.includes(c.he) || t.includes(c.en.toLowerCase()) || t.includes(c.local.toLowerCase()) || t.includes(c.slug.replace("-", " "))) || null;
  }
  const api = { CITIES, findCity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.Masa = root.Masa || {}; root.Masa.cities = api; }
})(typeof window !== "undefined" ? window : globalThis);
