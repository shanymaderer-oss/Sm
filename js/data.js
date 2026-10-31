/* מסע · data. Generated from the prototype, then extended. */
window.MASA_DATA = (() => {
const P = {
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  play:'<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/>',
  camera:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8"/>',
  bus:'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8" cy="14.5" r=".8"/><circle cx="16" cy="14.5" r=".8"/>',
  car:'<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v2M17 19v2"/><circle cx="7.5" cy="13.5" r=".8"/><circle cx="16.5" cy="13.5" r=".8"/>',
  boat:'<path d="M3 17l2 3h14l2-3zM6 17V9h12v8M12 9V4l4 5"/>',
  sim:'<path d="M7 3h7l4 4v14H7z"/><rect x="9.5" y="11" width="6" height="6" rx="1"/>',
  access:'<circle cx="12" cy="4.5" r="1.8"/><path d="M8 9h8M12 9v5l3 6M12 14l-3 6"/>',
  share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  minus:'<path d="M5 12h14"/>',
  history:'<path d="M4 20h16M5.5 20v-9M9.5 20v-9M14.5 20v-9M18.5 20v-9M3 11l9-6 9 6z"/>',
  food:'<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2.2 0-3.5 2.4-3.5 6s1.2 4 3.5 4"/>',
  art:'<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-1.2-1-1.4-1-2.4 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/>',
  nature:'<path d="M12 21v-5M12 3l7 10H5z"/><path d="M8 13l-3 4h14l-3-4"/>',
  night:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  shopping:'<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  view:'<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  religion:'<path d="M12 2v4M10 4h4M5 21v-8a7 7 0 0 1 14 0v8M3 21h18M10 21v-4a2 2 0 0 1 4 0v4"/>',
  family:'<circle cx="8" cy="6" r="2.5"/><circle cx="16.5" cy="8" r="2"/><path d="M4 20v-5a4 4 0 0 1 8 0v5M13 20v-4a3.5 3.5 0 0 1 7 0v4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12"/>',
  hourglass:'<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
  pin:'<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  route:'<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  ticket:'<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="M9 6l6 6-6 6"/>',
  fwd:'<path d="M15 6l-6 6 6 6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  nav:'<path d="M3 11l18-8-8 18-2-8z"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  shield:'<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  guide:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/><path d="M15.5 4.5l3-1.5"/>',
  book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  sound:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.3"/><path d="M16 14.5c2.5.2 4.3 1.8 4.8 4.5"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  gem:'<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 6 3-6M12 9v12"/>',
  train:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/><circle cx="9" cy="14" r=".8"/><circle cx="15" cy="14" r=".8"/>',
  speech:'<path d="M4 5h16v11H9l-5 4z"/><path d="M9 9h.01M12 9h.01M15 9h.01"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',bed:'<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6"/><circle cx="6.5" cy="11.5" r="1.6"/>',
  free:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" transform="rotate(45 12 12)"/>'
};
const CATS = {
  history:{he:"היסטוריה",c:"--coral"}, food:{he:"אוכל",c:"--sun"}, art:{he:"אמנות",c:"--violet"}, nature:{he:"טבע",c:"--teal"},
  night:{he:"חיי לילה",c:"--primary"}, shopping:{he:"קניות",c:"--rose"}, view:{he:"צילום ונופים",c:"--sky"}, religion:{he:"מקומות קדושים",c:"--violet"}, family:{he:"משפחה",c:"--teal"}, sleep:{he:"לינה",c:"--primary"}
};
const INTERESTS = ["history","food","art","nature","night","shopping","view","family"];
const DAYC = ["--coral","--sky","--teal","--violet","--sun"];
const DESTS = [
  {he:"רומא",country:"איטליה",q:"רומא, איטליה",lat:41.9028,lng:12.4964,days:"3–4 ימים",grad:["--coral","--sun"]},
  {he:"פריז",country:"צרפת",q:"פריז, צרפת",lat:48.8566,lng:2.3522,days:"4 ימים",grad:["--primary","--violet"]},
  {he:"ברצלונה",country:"ספרד",q:"ברצלונה, ספרד",lat:41.3874,lng:2.1686,days:"3–4 ימים",grad:["--rose","--coral"]},
  {he:"טוקיו",country:"יפן",q:"טוקיו, יפן",lat:35.6762,lng:139.6503,days:"5 ימים",grad:["--violet","--rose"]},
  {he:"ניו יורק",country:"ארה״ב",q:"ניו יורק, ארה״ב",lat:40.7128,lng:-74.006,days:"5 ימים",grad:["--sky","--primary"]},
  {he:"ליסבון",country:"פורטוגל",q:"ליסבון, פורטוגל",lat:38.7223,lng:-9.1393,days:"3 ימים",grad:["--sun","--teal"]},
  {he:"בנגקוק",country:"תאילנד",q:"בנגקוק, תאילנד",lat:13.7563,lng:100.5018,days:"3–4 ימים",grad:["--teal","--sky"]},
  {he:"אתונה",country:"יוון",q:"אתונה, יוון",lat:37.9838,lng:23.7275,days:"2–3 ימים",grad:["--sky","--teal"]},
  {he:"לונדון",country:"בריטניה",q:"לונדון, בריטניה",lat:51.5072,lng:-0.1276,days:"4 ימים",grad:["--primary","--teal"]},
  {he:"פראג",country:"צ׳כיה",q:"פראג, צ׳כיה",lat:50.0755,lng:14.4378,days:"3 ימים",grad:["--coral","--violet"]}
];
const HOURS=[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
/* the sample trip (Rome) is js/sample-trip.json, loaded only when someone opens it */
const PH=(he,local,say)=>({he,local,say});
const COUNTRY_LANG={it:"it",sm:"it",va:"it",fr:"fr",mc:"fr",es:"es",mx:"es",ar:"es",co:"es",pe:"es",cl:"es",pt:"pt",br:"pt",de:"de",at:"de",ch:"de",gr:"el",cy:"el",cz:"cs",nl:"nl",gb:"en",us:"en",ie:"en",au:"en",ca:"en",nz:"en",th:"th",jp:"ja"};
const ETIQUETTE_GENERIC=["שמרו צילום של הדרכון בטלפון ובענן.","באזורים צפופים ובתחבורה הציבורית שימו לב לכייסים.","בדקו אם נהוג להשאיר טיפ במדינה, ובאיזה גובה.","הורידו מפה אופליין של העיר לפני שיוצאים, למקרה שאין קליטה."];
/* practical facts per country. Short, and checked at the time of writing; the screen asks travelers to confirm before they fly */
const COUNTRY_CUR={"it":"EUR","fr":"EUR","es":"EUR","pt":"EUR","de":"EUR","at":"EUR","nl":"EUR","gr":"EUR","cz":"CZK","hu":"HUF","gb":"GBP","us":"USD","th":"THB","jp":"JPY","tr":"TRY","ge":"GEL","cy":"EUR","ae":"AED","pl":"PLN","bg":"EUR","ro":"RON","rs":"RSD","ie":"EUR","dk":"DKK","ch":"CHF","se":"SEK","no":"NOK","fi":"EUR","is":"ISK","be":"EUR","lv":"EUR","lt":"EUR","ee":"EUR","si":"EUR","hr":"EUR","sk":"EUR","ca":"CAD","sg":"SGD","kr":"KRW","vn":"VND","mx":"MXN","ma":"MAD","al":"ALL","am":"AMD","az":"AZN","cn":"CNY","hk":"HKD","tw":"TWD","my":"MYR","id":"IDR","in":"INR","np":"NPR","lk":"LKR","qa":"QAR","jo":"JOD","eg":"EGP","cu":"CUP","br":"BRL","ar":"ARS","pe":"PEN","co":"COP","cl":"CLP","za":"ZAR","tz":"TZS","au":"AUD","nz":"NZD","lu":"EUR","mt":"EUR","me":"EUR","ba":"BAM"};
/* known destinations: skip the search step and go straight to the places */
const DEST_GEO={
 "רומא":{local:"Roma",cc:"it",country:"איטליה",r:.06},"פריז":{local:"Paris",cc:"fr",country:"צרפת",r:.06},"ברצלונה":{local:"Barcelona",cc:"es",country:"ספרד",r:.05},
 "טוקיו":{local:"東京",cc:"jp",country:"יפן",r:.08},"ניו יורק":{local:"New York",cc:"us",country:"ארצות הברית",r:.06},"ליסבון":{local:"Lisboa",cc:"pt",country:"פורטוגל",r:.045},
 "בנגקוק":{local:"กรุงเทพมหานคร",cc:"th",country:"תאילנד",r:.06},"אתונה":{local:"Αθήνα",cc:"gr",country:"יוון",r:.04},"לונדון":{local:"London",cc:"gb",country:"בריטניה",r:.06},"פראג":{local:"Praha",cc:"cz",country:"צ׳כיה",r:.045}};
DESTS.forEach(d=>{const m=DEST_GEO[d.he]; if(m) d.geo={lat:d.lat,lng:d.lng,name:d.he,local:m.local,cc:m.cc,country:m.country,bbox:{s:d.lat-m.r,n:d.lat+m.r,w:d.lng-m.r*1.3,e:d.lng+m.r*1.3}};});
return {COUNTRY_CUR,P,CATS,INTERESTS,DAYC,DESTS,HOURS,COUNTRY_LANG,ETIQUETTE_GENERIC};
})();
