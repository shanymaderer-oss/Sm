/* מסע · getting there and getting around.
   From the airport to the city: every main option with time, price and how comfortable it is.
   Prices are typical fares at the time of writing, in the local currency, and change often:
   the screen shows them as an estimate and links to check. eur = rough euro value, used only to compare.
   c = comfort: 3 door to door, 2 direct and seated, 1 changes or crowded with luggage. */
window.Masa = window.Masa || {};
Masa.transport = (() => {
  const O = (ap, m, n, min, p, eur, c, to, note) => ({ ap, m, n, min, p, eur, c, to, note: note || "" });
  const AIR = {
    rome: { ap: { FCO: "פיומיצ׳ינו", CIA: "צ׳מפינו" }, o: [
      O("FCO", "train", "Leonardo Express", 32, "€14", 14, 2, "תחנת טרמיני", "רכבת ישירה בלי עצירות, כל 15 דקות"),
      O("FCO", "train", "רכבת FL1", 45, "€8", 8, 1.5, "טרסטבר / טיבורטינה"),
      O("FCO", "bus", "אוטובוס (Terravision / SIT / TAM)", 55, "€7–8", 7, 1.5, "טרמיני", "תלוי בפקקים"),
      O("FCO", "taxi", "מונית לבנה רשמית", 45, "€55 מחיר קבוע", 55, 3, "כל מקום בתוך החומות", "מחיר קבוע לכל הנוסעים והמזוודות"),
      O("CIA", "bus", "אוטובוס (Terravision / SIT)", 40, "€6–7", 6, 1.5, "טרמיני"),
      O("CIA", "taxi", "מונית לבנה רשמית", 30, "€40 מחיר קבוע", 40, 3, "כל מקום בתוך החומות")] },
    paris: { ap: { CDG: "שארל דה גול", ORY: "אורלי" }, o: [
      O("CDG", "train", "RER B", 40, "€14 (כרטיס שדה תעופה)", 14, 1, "גאר דו נור / שאטלה", "צפוף עם מזוודות, עדיף להימנע בשעות שיא"),
      O("CDG", "bus", "Roissybus", 70, "€16", 16, 1.5, "האופרה"),
      O("CDG", "taxi", "מונית רשמית", 45, "כ-€56 (גדה ימנית) / €65 (גדה שמאלית)", 60, 3, "כל מקום בפריז", "מחיר קבוע"),
      O("ORY", "metro", "מטרו קו 14", 30, "€14 (כרטיס שדה תעופה)", 14, 2, "שאטלה / גאר דה ליון", "ישיר למרכז, בלי החלפות"),
      O("ORY", "taxi", "מונית רשמית", 30, "כ-€36 (גדה שמאלית) / €44 (גדה ימנית)", 40, 3, "כל מקום בפריז", "מחיר קבוע")] },
    barcelona: { ap: { BCN: "אל פראט" }, o: [
      O("BCN", "bus", "Aerobús", 35, "€7.25", 7, 2, "פלאסה קטלוניה", "כל 5–10 דקות, מקום למזוודות"),
      O("BCN", "train", "רכבת R2 Nord (מטרמינל 2)", 25, "כ-€3", 3, 1.5, "פסאג׳ דה גרסיה", "מטרמינל 1 צריך שאטל לטרמינל 2"),
      O("BCN", "metro", "מטרו L9 Sud", 45, "€5.80", 6, 1, "עם החלפה למרכז"),
      O("BCN", "taxi", "מונית", 30, "€35–40", 38, 3, "כל מקום בעיר")] },
    london: { ap: { LHR: "הית׳רו", LGW: "גטוויק", STN: "סטנסטד", LTN: "לוטון" }, o: [
      O("LHR", "train", "Elizabeth line", 35, "כ-£13", 15, 2, "פדינגטון / טוטנהאם קורט רואד", "משלמים בכרטיס אשראי בשער"),
      O("LHR", "metro", "קו פיקדילי (Underground)", 55, "כ-£5.60", 6.5, 1, "מרכז לונדון", "הכי זול, אבל ארוך וצפוף"),
      O("LHR", "train", "Heathrow Express", 15, "£25 (זול יותר בהזמנה מראש)", 29, 2.5, "פדינגטון"),
      O("LHR", "taxi", "מונית שחורה / Uber", 55, "£60–100, באפליקציה £35–70", 65, 3, "כל מקום בעיר"),
      O("LGW", "train", "רכבת Southern / Thameslink", 35, "£12–20", 18, 2, "ויקטוריה / לונדון ברידג׳"),
      O("LGW", "train", "Gatwick Express", 30, "כ-£22", 25, 2.5, "ויקטוריה"),
      O("STN", "train", "Stansted Express", 50, "£20–25", 26, 2.5, "ליברפול סטריט"),
      O("STN", "bus", "National Express", 75, "£10–15", 14, 1.5, "מרכז לונדון"),
      O("LTN", "train", "Luton DART + Thameslink", 45, "£18–25", 24, 2, "סנט פנקרס")] },
    prague: { ap: { PRG: "ואצלב האבל" }, o: [
      O("PRG", "bus", "אוטובוס 119 + מטרו A", 40, "כרטיס 90 דקות, 40 Kč", 1.6, 1, "מוסטק / העיר העתיקה", "כרטיס אחד לאוטובוס ולמטרו"),
      O("PRG", "bus", "Airport Express (AE)", 35, "כ-60 Kč", 2.4, 2, "התחנה המרכזית"),
      O("PRG", "taxi", "מונית רשמית / Uber / Bolt", 30, "400–600 Kč", 20, 3, "כל מקום בעיר", "מחיר ידוע מראש באפליקציה")] },
    budapest: { ap: { BUD: "ליסט פרנץ" }, o: [
      O("BUD", "bus", "אוטובוס 100E", 40, "2,500 HUF", 6.5, 2, "דאק פרנץ טר (מרכז)", "כרטיס מיוחד לקו הזה, קונים במכונה"),
      O("BUD", "taxi", "Főtaxi רשמית / Bolt", 30, "כ-11,000 HUF", 28, 3, "כל מקום בעיר")] },
    vienna: { ap: { VIE: "שווכאט" }, o: [
      O("VIE", "train", "רכבת S7 / ÖBB Railjet", 25, "כ-€4.50", 4.5, 2, "וין מיטה / התחנה המרכזית"),
      O("VIE", "train", "CAT (City Airport Train)", 16, "כ-€14", 14, 2.5, "וין מיטה"),
      O("VIE", "taxi", "מונית / Uber / Bolt", 25, "€35–45", 40, 3, "כל מקום בעיר")] },
    berlin: { ap: { BER: "ברנדנבורג" }, o: [
      O("BER", "train", "רכבת FEX / RE", 30, "כרטיס ABC כ-€5", 5, 2, "התחנה המרכזית (Hbf)"),
      O("BER", "taxi", "מונית / Uber", 40, "€55–70", 62, 3, "כל מקום בעיר")] },
    amsterdam: { ap: { AMS: "סכיפהול" }, o: [
      O("AMS", "train", "רכבת NS", 17, "כ-€6.50", 6.5, 2, "אמסטרדם סנטרל", "כל כמה דקות, משלמים בכרטיס אשראי בשער"),
      O("AMS", "bus", "אוטובוס 397", 30, "כ-€7", 7, 2, "לייסדפליין / מוזיאונים"),
      O("AMS", "taxi", "מונית / Uber", 25, "€50–60", 55, 3, "כל מקום בעיר")] },
    lisbon: { ap: { LIS: "הומברטו דלגדו" }, o: [
      O("LIS", "metro", "מטרו (קו אדום)", 25, "כ-€2 + כרטיס Viva Viagem", 2.5, 1, "מרכז העיר, עם החלפה"),
      O("LIS", "bus", "Aerobus", 30, "כ-€4", 4, 2, "רוסיו / קאיש דו סודרה"),
      O("LIS", "taxi", "Uber / Bolt / מונית", 20, "€12–20", 16, 3, "כל מקום בעיר")] },
    porto: { ap: { OPO: "פרנסיסקו סה קרניירו" }, o: [
      O("OPO", "metro", "מטרו קו E (סגול)", 30, "כ-€2.60", 2.6, 2, "טרינדדה (מרכז)"),
      O("OPO", "taxi", "Uber / Bolt / מונית", 25, "€20–30", 25, 3, "כל מקום בעיר")] },
    madrid: { ap: { MAD: "בראחס" }, o: [
      O("MAD", "bus", "Airport Express (אוטובוס)", 40, "€5", 5, 2, "סיבלס / אטוצ׳ה", "פועל 24 שעות"),
      O("MAD", "metro", "מטרו קו 8", 35, "כ-€5 (כולל תוספת שדה)", 5, 1, "נואבוס מיניסטריוס, עם החלפה"),
      O("MAD", "train", "רכבת Cercanías C1 (מטרמינל 4)", 25, "כ-€2.60", 2.6, 2, "צ׳מרטין / אטוצ׳ה"),
      O("MAD", "taxi", "מונית", 30, "€33 מחיר קבוע", 33, 3, "בתוך הטבעת M-30")] },
    athens: { ap: { ATH: "אלפתריוס ונזילוס" }, o: [
      O("ATH", "metro", "מטרו קו 3", 40, "€9", 9, 2, "סינטגמה / מונסטירקי"),
      O("ATH", "bus", "אוטובוס X95", 60, "€5.50", 5.5, 1.5, "סינטגמה", "פועל 24 שעות"),
      O("ATH", "taxi", "מונית", 40, "כ-€50 ביום / €65 בלילה, מחיר קבוע", 55, 3, "מרכז אתונה")] },
    milan: { ap: { MXP: "מלפנסה", LIN: "לינאטה", BGY: "ברגמו" }, o: [
      O("MXP", "train", "Malpensa Express", 50, "€13", 13, 2, "קדורנה / התחנה המרכזית"),
      O("MXP", "bus", "אוטובוס לתחנה המרכזית", 55, "€10", 10, 1.5, "התחנה המרכזית"),
      O("MXP", "taxi", "מונית", 50, "כ-€110 מחיר קבוע", 110, 3, "מרכז מילאנו"),
      O("LIN", "metro", "מטרו M4", 15, "כ-€2.50", 2.5, 2, "סן בבילה (מרכז)"),
      O("LIN", "taxi", "מונית", 20, "€25–30", 27, 3, "מרכז מילאנו"),
      O("BGY", "bus", "אוטובוס", 60, "€10–12", 11, 1.5, "התחנה המרכזית של מילאנו")] },
    florence: { ap: { FLR: "פרטולה", PSA: "פיזה" }, o: [
      O("FLR", "tram", "חשמלית T2", 20, "€1.70", 1.7, 2, "סנטה מריה נובלה"),
      O("FLR", "taxi", "מונית", 20, "כ-€25–30 מחיר קבוע", 27, 3, "מרכז העיר"),
      O("PSA", "train", "PisaMover + רכבת", 75, "€10–15", 12, 1.5, "סנטה מריה נובלה")] },
    venice: { ap: { VCE: "מרקו פולו", TSF: "טרוויזו" }, o: [
      O("VCE", "bus", "אוטובוס ATVO / ACTV", 25, "כ-€10", 10, 2, "פיאצלה רומא", "משם ממשיכים ברגל או בואפורטו"),
      O("VCE", "boat", "Alilaguna (מעבורת)", 70, "€15", 15, 2, "סן מרקו / ריאלטו", "מגיעה ישר לתוך ונציה"),
      O("VCE", "taxi", "מונית מים", 30, "€120–150", 135, 3, "עד המלון", "שווה לקבוצה עם הרבה מזוודות"),
      O("TSF", "bus", "אוטובוס", 70, "כ-€12", 12, 1.5, "פיאצלה רומא")] },
    "new-york": { ap: { JFK: "ג׳ון קנדי", EWR: "ניוארק", LGA: "לה גוארדיה" }, o: [
      O("JFK", "train", "AirTrain + סאבוויי", 70, "כ-$11.40", 10, 1, "מנהטן", "הכי זול, עם מזוודות מתיש"),
      O("JFK", "train", "AirTrain + LIRR", 40, "כ-$17–20", 16, 2, "פן סטיישן / גרנד סנטרל"),
      O("JFK", "taxi", "מונית צהובה", 60, "$70 קבוע + אגרות וטיפ (כ-$90–100)", 82, 3, "כל מקום במנהטן"),
      O("EWR", "train", "AirTrain + NJ Transit", 35, "כ-$16", 14, 2, "פן סטיישן"),
      O("LGA", "bus", "Q70 (חינם) + סאבוויי", 45, "$2.90", 2.5, 1, "מנהטן"),
      O("LGA", "taxi", "מונית / Uber", 35, "$40–60", 44, 3, "מנהטן")] },
    bangkok: { ap: { BKK: "סוברנבומי", DMK: "דון מואנג" }, o: [
      O("BKK", "train", "Airport Rail Link", 30, "45 באט", 1.2, 2, "פאיה תאי (מתחברים ל-BTS)"),
      O("BKK", "taxi", "מונית במונה / Grab", 40, "300–450 באט + 50 באט תוספת שדה + אגרות", 11, 3, "כל מקום בעיר", "בתור הרשמי בקומה 1"),
      O("DMK", "bus", "אוטובוס A1 / A2", 40, "30–50 באט", 1.2, 1.5, "צ׳אטוצ׳אק / מו צ׳יט"),
      O("DMK", "taxi", "מונית / Grab", 35, "250–400 באט", 9, 3, "כל מקום בעיר")] },
    tokyo: { ap: { NRT: "נריטה", HND: "האנדה" }, o: [
      O("NRT", "train", "Keisei Skyliner", 40, "כ-¥2,600", 15, 2.5, "אואנו"),
      O("NRT", "train", "Narita Express (N'EX)", 60, "כ-¥3,100", 18, 2.5, "תחנת טוקיו / שינג׳וקו"),
      O("NRT", "bus", "אוטובוס לתחנת טוקיו", 75, "כ-¥1,300–1,500", 8, 2, "תחנת טוקיו / גינזה"),
      O("HND", "train", "Keikyu Line", 20, "כ-¥330", 2, 2, "שינגאווה"),
      O("HND", "train", "מונורייל", 20, "כ-¥500", 3, 2, "המאמצוצ׳ו"),
      O("HND", "taxi", "מונית", 30, "¥7,000–9,000", 48, 3, "מרכז טוקיו")] },
    istanbul: { ap: { IST: "שדה התעופה של איסטנבול", SAW: "סביחה גוקצ׳ן" }, o: [
      O("IST", "metro", "מטרו M11 + M2 + חשמלית T1", 75, "כ-120 לירות (Istanbulkart)", 2.5, 1, "סולטנאחמט / טקסים"),
      O("IST", "bus", "Havaist", 80, "כ-350–400 לירות", 8, 2, "טקסים / אקסראי"),
      O("IST", "taxi", "מונית במונה / BiTaksi", 50, "כ-2,400 לירות", 50, 3, "כל מקום בעיר"),
      O("SAW", "bus", "Havabus", 80, "כ-€5", 5, 2, "טקסים"),
      O("SAW", "taxi", "מונית", 60, "€35–55", 45, 3, "כל מקום בעיר")] },
    batumi: { ap: { BUS: "בטומי" }, o: [
      O("BUS", "bus", "אוטובוס 10", 20, "כ-1 לארי", 0.3, 1.5, "מרכז העיר"),
      O("BUS", "taxi", "מונית / Bolt", 15, "20–30 לארי", 8, 3, "כל מקום בעיר")] },
    tbilisi: { ap: { TBS: "שותא רוסתוולי" }, o: [
      O("TBS", "bus", "אוטובוס 337", 45, "כ-1 לארי", 0.3, 1.5, "תחנת הרכבת / רוסתוולי"),
      O("TBS", "taxi", "Bolt / מונית", 25, "25–40 לארי", 10, 3, "כל מקום בעיר", "ב-Bolt המחיר ידוע מראש")] },
    larnaca: { ap: { LCA: "לרנקה" }, o: [
      O("LCA", "bus", "אוטובוס 425 / 417", 20, "€1.50–2.40", 2, 1.5, "מרכז לרנקה / פיניקודס"),
      O("LCA", "taxi", "מונית", 15, "€20–25", 22, 3, "כל מקום בעיר")] },
    limassol: { ap: { LCA: "לרנקה", PFO: "פאפוס" }, o: [
      O("LCA", "bus", "שאטל Limassol Airport Express (Kapnos)", 50, "כ-€9", 9, 2, "לימסול"),
      O("LCA", "taxi", "מונית", 45, "€60–75", 68, 3, "עד המלון"),
      O("PFO", "bus", "שאטל Limassol Airport Express", 50, "כ-€9", 9, 2, "לימסול")] },
    paphos: { ap: { PFO: "פאפוס", LCA: "לרנקה" }, o: [
      O("PFO", "bus", "אוטובוס 612 / 613", 30, "€1.50–2.40", 2, 1.5, "קאטו פאפוס / המרכז"),
      O("PFO", "taxi", "מונית", 20, "€25–30", 27, 3, "כל מקום בעיר"),
      O("LCA", "bus", "שאטל (Kapnos)", 110, "כ-€15", 15, 2, "פאפוס")] },
    nice: { ap: { NCE: "קוט ד׳אזור" }, o: [
      O("NCE", "tram", "חשמלית קו 2", 25, "כ-€2", 2, 2, "מרכז ניס / הנמל"),
      O("NCE", "taxi", "מונית", 20, "כ-€32 מחיר קבוע", 32, 3, "מרכז ניס")] },
    munich: { ap: { MUC: "פרנץ יוזף שטראוס" }, o: [
      O("MUC", "train", "רכבת S1 / S8", 40, "כ-€15 (כרטיס יומי לשדה ולעיר כ-€16)", 15, 2, "מריינפלאץ / התחנה המרכזית", "כרטיס יומי לשדה ולעיר משתלם יותר"),
      O("MUC", "bus", "Lufthansa Express Bus", 45, "כ-€13", 13, 2, "התחנה המרכזית"),
      O("MUC", "taxi", "מונית", 40, "€65–85", 75, 3, "כל מקום בעיר")] },
    dubai: { ap: { DXB: "דובאי הבינלאומי" }, o: [
      O("DXB", "metro", "מטרו קו אדום", 25, "AED 5–8 (כרטיס Nol)", 2, 2, "דאונטאון / בורג׳ חליפה"),
      O("DXB", "taxi", "מונית / Careem / Uber", 20, "AED 60–90", 18, 3, "כל מקום בעיר")] },
    krakow: { ap: { KRK: "יוחנן פאולוס השני" }, o: [
      O("KRK", "train", "רכבת לתחנה המרכזית", 18, "כ-18 זלוטי", 4, 2, "קרקוב גלובני (ליד העיר העתיקה)"),
      O("KRK", "bus", "אוטובוס 208 / 252", 40, "כ-6 זלוטי", 1.5, 1.5, "מרכז העיר"),
      O("KRK", "taxi", "Uber / Bolt", 25, "60–90 זלוטי", 18, 3, "כל מקום בעיר")] },
    warsaw: { ap: { WAW: "שופן", WMI: "מודלין" }, o: [
      O("WAW", "train", "רכבת S2 / S3", 25, "כ-5 זלוטי", 1.2, 2, "התחנה המרכזית"),
      O("WAW", "bus", "אוטובוס 175", 30, "כ-5 זלוטי", 1.2, 1.5, "מרכז העיר / העיר העתיקה"),
      O("WAW", "taxi", "Uber / Bolt", 20, "40–70 זלוטי", 13, 3, "כל מקום בעיר"),
      O("WMI", "bus", "אוטובוס מודלין", 45, "20–35 זלוטי", 6, 2, "מרכז ורשה")] },
    sofia: { ap: { SOF: "סופיה" }, o: [
      O("SOF", "metro", "מטרו M1 (מטרמינל 2)", 25, "כ-€0.80", 0.8, 2, "סרדיקה (מרכז)"),
      O("SOF", "taxi", "מונית OK Supertrans / Yellow", 20, "€10–15", 12, 3, "כל מקום בעיר", "רק מהדוכן הרשמי")] },
    bucharest: { ap: { OTP: "אנרי קואנדה" }, o: [
      O("OTP", "train", "רכבת לגארה דה נורד", 20, "כ-7 לאו", 1.4, 2, "גארה דה נורד"),
      O("OTP", "bus", "אוטובוס 783 / 100", 45, "כ-5 לאו", 1, 1.5, "פיאצה אוניריי (מרכז)"),
      O("OTP", "taxi", "Uber / Bolt", 30, "60–90 לאו", 15, 3, "כל מקום בעיר")] },
    thessaloniki: { ap: { SKG: "מקדוניה" }, o: [
      O("SKG", "bus", "אוטובוס 01X / 01N", 50, "כ-€1.80", 1.8, 1.5, "מרכז העיר / תחנת הרכבת"),
      O("SKG", "taxi", "מונית", 25, "€25–35", 30, 3, "מרכז העיר")] },
    naples: { ap: { NAP: "קאפודיקינו" }, o: [
      O("NAP", "bus", "Alibus", 25, "€5", 5, 2, "פיאצה גריבלדי / נמל בברלו"),
      O("NAP", "taxi", "מונית", 20, "€19–28 מחיר קבוע", 25, 3, "מרכז העיר")] },
    belgrade: { ap: { BEG: "ניקולה טסלה" }, o: [
      O("BEG", "bus", "מיניבוס A1", 30, "כ-400 דינר", 3.4, 2, "סלביה"),
      O("BEG", "bus", "אוטובוס 72", 40, "כרטיס רגיל", 1, 1.5, "זלני ונאץ"),
      O("BEG", "taxi", "מונית רשמית / CarGo", 25, "2,000–2,800 דינר", 20, 3, "כל מקום בעיר", "מקבלים קבלה עם מחיר בדוכן ביציאה")] },
    dublin: { ap: { DUB: "דבלין" }, o: [
      O("DUB", "bus", "Dublin Express / Aircoach", 35, "€8–10", 9, 2, "או׳קונל / מרכז העיר"),
      O("DUB", "bus", "אוטובוס עירוני 16 / 41", 45, "כ-€2–3", 2.5, 1.5, "מרכז העיר"),
      O("DUB", "taxi", "מונית / FreeNow", 30, "€30–40", 35, 3, "כל מקום בעיר")] },
    edinburgh: { ap: { EDI: "אדינבורו" }, o: [
      O("EDI", "tram", "חשמלית", 35, "כ-£7.50", 8.7, 2, "פרינסס סטריט"),
      O("EDI", "bus", "Airlink 100", 30, "כ-£5.50", 6.4, 2, "ווברלי"),
      O("EDI", "taxi", "מונית", 25, "£30–35", 37, 3, "כל מקום בעיר")] },
    copenhagen: { ap: { CPH: "קסטרופ" }, o: [
      O("CPH", "metro", "מטרו M2 / רכבת", 15, "כ-36 DKK", 5, 2, "קונגנס ניטורב / התחנה המרכזית"),
      O("CPH", "taxi", "מונית", 20, "300–400 DKK", 47, 3, "כל מקום בעיר")] },
    seville: { ap: { SVQ: "סביליה" }, o: [
      O("SVQ", "bus", "אוטובוס EA", 35, "כ-€4", 4, 2, "פלאסה דה ארמאס / מרכז העיר"),
      O("SVQ", "taxi", "מונית", 20, "כ-€25–30 מחיר קבוע", 27, 3, "מרכז העיר")] },
    valencia: { ap: { VLC: "מניסס" }, o: [
      O("VLC", "metro", "מטרו קווים 3 / 5", 25, "כ-€5", 5, 2, "מרכז העיר (שאטה / קולון)"),
      O("VLC", "bus", "אוטובוס 150", 45, "כ-€1.50", 1.5, 1.5, "מרכז העיר"),
      O("VLC", "taxi", "מונית", 20, "€20–25", 22, 3, "כל מקום בעיר")] }
  };
  /* getting around: the ticket to buy, ride apps, and a taxi price per km (euro) for the per-leg estimate */
  const CITY = {
    rome: { pass: "כרטיס 24/48/72 שעות לאוטובוס, מטרו וחשמלית, או תשלום בכרטיס אשראי בשער", apps: ["FreeNow", "itTaxi", "Uber"], km: 1.6, flag: 4 },
    paris: { pass: "כרטיס Navigo Easy נטען, או כרטיס יומי (Paris Visite / Navigo Jour)", apps: ["Uber", "Bolt", "G7"], km: 1.6, flag: 4.5 },
    barcelona: { pass: "כרטיס T-casual ל-10 נסיעות, או Hola Barcelona לכמה ימים", apps: ["FreeNow", "Cabify", "Uber"], km: 1.3, flag: 2.6 },
    london: { pass: "משלמים בכרטיס אשראי או בטלפון בשער (contactless). יש תקרה יומית, אז לא משלמים יותר מכרטיס יומי", apps: ["Uber", "Bolt", "FreeNow"], km: 2.8, flag: 4 },
    prague: { pass: "כרטיס 24 או 72 שעות, או באפליקציית PID Lítačka", apps: ["Bolt", "Uber", "Liftago"], km: 1.2, flag: 2.5 },
    budapest: { pass: "כרטיס 24 או 72 שעות, או באפליקציית BudapestGO", apps: ["Bolt", "Főtaxi"], km: 1.2, flag: 3 },
    vienna: { pass: "כרטיס 24/48/72 שעות, או באפליקציית WienMobil", apps: ["Uber", "Bolt"], km: 1.7, flag: 4 },
    berlin: { pass: "כרטיס יומי AB, או Berlin WelcomeCard", apps: ["Uber", "Bolt", "FreeNow"], km: 2.3, flag: 4.3 },
    amsterdam: { pass: "משלמים בכרטיס אשראי בשער (OVpay), או כרטיס GVB ל-1–7 ימים", apps: ["Uber", "Bolt"], km: 2.5, flag: 3.5 },
    lisbon: { pass: "כרטיס Viva Viagem נטען (Zapping) או כרטיס 24 שעות", apps: ["Uber", "Bolt", "FreeNow"], km: 1.0, flag: 3.5 },
    porto: { pass: "כרטיס Andante נטען או Andante Tour", apps: ["Uber", "Bolt"], km: 1.0, flag: 3.5 },
    madrid: { pass: "כרטיס Multi נטען (10 נסיעות) או Abono Turístico", apps: ["Cabify", "Uber", "FreeNow"], km: 1.3, flag: 3 },
    athens: { pass: "כרטיס 24 שעות או 5 ימים (ATH.ENA)", apps: ["FreeNow", "Uber"], km: 0.9, flag: 4 },
    milan: { pass: "משלמים בכרטיס אשראי בשער המטרו, או כרטיס 24/48 שעות", apps: ["FreeNow", "itTaxi", "Uber"], km: 1.6, flag: 4 },
    florence: { pass: "המרכז קטן והולכים ברגל. לאוטובוס וחשמלית: כרטיס 90 דקות", apps: ["itTaxi", "FreeNow"], km: 1.7, flag: 4 },
    venice: { pass: "כרטיס ואפורטו ל-1–7 ימים (נסיעה בודדת יקרה)", apps: [], km: 0, flag: 0, note: "אין מכוניות בעיר. הולכים ברגל או נוסעים בואפורטו (סירה ציבורית)." },
    "new-york": { pass: "משלמים בכרטיס אשראי או בטלפון בשער (OMNY), עם תקרה שבועית", apps: ["Uber", "Lyft"], km: 2.6, flag: 3 },
    bangkok: { pass: "כרטיס Rabbit ל-BTS, או משלמים בכרטיס אשראי במטרו", apps: ["Grab", "Bolt"], km: 0.3, flag: 1 },
    tokyo: { pass: "כרטיס Suica או Pasmo בטלפון, או Tokyo Subway Ticket ל-24–72 שעות", apps: ["GO", "Uber"], km: 3, flag: 3 },
    istanbul: { pass: "כרטיס Istanbulkart נטען לכל התחבורה, כולל המעבורות", apps: ["BiTaksi", "Uber"], km: 0.8, flag: 1.5 },
    batumi: { pass: "כרטיס תחבורה נטען או תשלום בכרטיס אשראי באוטובוס", apps: ["Bolt", "Yandex Go"], km: 0.3, flag: 1 },
    tbilisi: { pass: "כרטיס Metromoney נטען, או כרטיס אשראי בשער המטרו", apps: ["Bolt", "Yandex Go"], km: 0.3, flag: 1 },
    larnaca: { pass: "כרטיס יומי לאוטובוסים (המרכז קטן והולכים ברגל)", apps: ["Bolt"], km: 1.0, flag: 4 },
    limassol: { pass: "כרטיס יומי לאוטובוסים, קו 30 לאורך הטיילת", apps: ["Bolt"], km: 1.0, flag: 4 },
    paphos: { pass: "כרטיס יומי לאוטובוסים", apps: ["Bolt"], km: 1.0, flag: 4 },
    nice: { pass: "כרטיס יומי או 7 ימים לחשמלית ולאוטובוס", apps: ["Uber", "Bolt"], km: 2.2, flag: 4 },
    munich: { pass: "כרטיס יומי (Tageskarte) או CityTourCard", apps: ["Uber", "FreeNow", "Bolt"], km: 2.3, flag: 5 },
    dubai: { pass: "כרטיס Nol נטען למטרו ולאוטובוס", apps: ["Careem", "Uber"], km: 0.6, flag: 3 },
    krakow: { pass: "כרטיס 24 או 72 שעות, או באפליקציה (jakdojade)", apps: ["Uber", "Bolt"], km: 0.7, flag: 2 },
    warsaw: { pass: "כרטיס 24 או 72 שעות, או באפליקציה (jakdojade)", apps: ["Uber", "Bolt", "FreeNow"], km: 0.7, flag: 2 },
    sofia: { pass: "משלמים בכרטיס אשראי בשער המטרו, או כרטיס יומי", apps: ["Bolt", "TaxiMe"], km: 0.6, flag: 1 },
    bucharest: { pass: "משלמים בכרטיס אשראי בשער ובאוטובוס, או כרטיס יומי", apps: ["Uber", "Bolt"], km: 0.6, flag: 1 },
    thessaloniki: { pass: "כרטיס נטען לאוטובוס ולמטרו החדש", apps: ["FreeNow", "Uber"], km: 0.9, flag: 4 },
    naples: { pass: "כרטיס יומי Unico Napoli (מטרו, אוטובוס, פוניקולר)", apps: ["itTaxi", "FreeNow"], km: 1.4, flag: 4 },
    belgrade: { pass: "כרטיס BusPlus נטען, או תשלום במסרון", apps: ["CarGo", "Yandex Go"], km: 0.6, flag: 2 },
    dublin: { pass: "כרטיס Leap Visitor ל-1–3 ימים", apps: ["FreeNow", "Uber"], km: 1.6, flag: 4.5 },
    edinburgh: { pass: "כרטיס יומי של Lothian Buses (גם באפליקציה)", apps: ["Uber", "Bolt"], km: 2.2, flag: 3.5 },
    copenhagen: { pass: "Copenhagen Card Hop או כרטיס City Pass ל-24–120 שעות", apps: ["Viggo", "DanTaxi"], km: 2.4, flag: 6 },
    seville: { pass: "כרטיס נטען Tarjeta Multiviaje, המרכז קטן והולכים ברגל", apps: ["Uber", "Cabify", "FreeNow"], km: 1.2, flag: 3 },
    valencia: { pass: "כרטיס SUMA נטען, או Valencia Tourist Card", apps: ["Uber", "Cabify", "FreeNow"], km: 1.2, flag: 3 }
  };
  const BY_CC = { it: 1.6, fr: 1.8, es: 1.3, pt: 1.0, de: 2.3, at: 1.7, nl: 2.5, gr: 0.9, cz: 1.2, hu: 1.2, gb: 2.5, us: 2.6, th: 0.3, jp: 3, tr: 0.8 };
  const MODE_HE = { train: "רכבת", metro: "מטרו", bus: "אוטובוס", taxi: "מונית", tram: "חשמלית", boat: "סירה" };
  const MODE_IC = { train: "train", metro: "train", bus: "bus", taxi: "car", tram: "train", boat: "boat" };

  /* the options from one airport, with the cheapest, the fastest and the most comfortable marked.
     "best" is the easiest: comfortable enough without paying a lot more than it is worth. */
  function airport(slug, need = {}) {
    const a = AIR[slug];
    if (!a) return null;
    const groups = {};
    for (const o of a.o) (groups[o.ap] = groups[o.ap] || []).push(o);
    return Object.entries(groups).map(([code, list]) => {
      const cheap = [...list].sort((x, y) => x.eur - y.eur)[0];
      const fast = [...list].sort((x, y) => x.min - y.min)[0];
      // easiest: comfort first; with luggage, kids or a wheelchair, door to door wins
      const wantDoor = need.family || need.mobility;
      const score = o => o.c * (wantDoor ? 3 : 2) - o.min / 30 - o.eur / (wantDoor ? 60 : 25);
      const easy = [...list].sort((x, y) => score(y) - score(x))[0];
      return { code, he: a.ap[code] || code, list: list.map(o => ({ ...o, cheap: o === cheap, fast: o === fast, easy: o === easy })) };
    });
  }
  /* a taxi for one leg of the day (euro), when walking is too far */
  function taxi(slug, cc, kmv) {
    const c = CITY[slug];
    const perKm = c ? c.km : BY_CC[cc] ?? 1.5;
    if (!perKm) return null;
    const flag = c ? c.flag : 3.5;
    const road = kmv * 1.35;
    return Math.max(flag + perKm * road, flag * 2);
  }
  return { AIR, CITY, airport, taxi, MODE_HE, MODE_IC, city: slug => CITY[slug] || null };
})();
