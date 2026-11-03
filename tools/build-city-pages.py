#!/usr/bin/env python3
"""A Hebrew page for every ready city (c/<slug>.html), a list of them (c/index.html) and sitemap.xml, so people who
search Google for "מסלול לרומא" or "מה לראות בפראג" find מסע. Each page has the city's best-known places (by how many
Wikipedia languages write about them), an idea for splitting them over 3 days by where they are, and a button that
opens the app ready to plan a trip there (index.html#go=<slug>). Plain HTML, no scripts.
Run by tools/stamp-sw.py, so the pages follow the city data on every release."""
import json, math, pathlib, subprocess, html, datetime
root = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://shanymaderer-oss.github.io/Sm/"
cities = json.loads(subprocess.run(["node", "-e", "process.stdout.write(JSON.stringify(require('./js/cities.js').CITIES))"], cwd=root, capture_output=True, text=True, check=True).stdout)
csp = next(l for l in (root / "privacy.html").read_text().splitlines() if 'http-equiv="Content-Security-Policy"' in l)
NOT_A_PLACE = {"memorial", "monument", "statue", "tomb", "grave"}
KIND = [("museum", "tourism", "museum", "מוזיאון"), ("gallery", "tourism", "gallery", "גלריה"), ("church", "amenity", "place_of_worship", "מקום תפילה"),
        ("castle", "historic", "castle", "טירה"), ("ruins", "historic", "ruins", "שרידים עתיקים"), ("park", "leisure", "park", "פארק"),
        ("garden", "leisure", "garden", "גן"), ("view", "tourism", "viewpoint", "תצפית"), ("zoo", "tourism", "zoo", "גן חיות"),
        ("square", "place", "square", "כיכר"), ("market", "amenity", "marketplace", "שוק"), ("palace", "historic", "palace", "ארמון"),
        ("beach", "natural", "beach", "חוף"), ("bridge", "man_made", "bridge", "גשר")]
def kind_he(t):
    for _, k, v, he in KIND:
        if t.get(k) == v: return he
    if t.get("building") in ("cathedral", "church", "basilica"): return "כנסייה"
    if t.get("historic"): return "אתר היסטורי"
    return "אטרקציה"
def top_places(d, n=12):
    F = d.get("fame") or {}; fame, he = F.get("n", {}), F.get("he", {})
    seen, out = set(), []
    for e in sorted((e for e in d.get("els", []) if (e.get("tags") or {}).get("wikidata") in fame), key=lambda e: -fame[e["tags"]["wikidata"]]):
        t = e["tags"]; q = t["wikidata"]
        if q in seen or t.get("historic") in NOT_A_PLACE or t.get("memorial") or t.get("tourism") in ("artwork", "hotel", "hostel") or t.get("amenity") in ("restaurant", "cafe", "bar"): continue
        name = t.get("name:he") or he.get(q) or t.get("name:en") or t.get("name")
        if not name: continue
        seen.add(q)
        c = e.get("center") or e
        out.append({"name": name, "local": t.get("name", ""), "kind": kind_he(t), "lat": float(c.get("lat", 0)), "lng": float(c.get("lon", c.get("lng", 0)))})
        if len(out) >= n: break
    return out
def three_days(places):
    """the 9 best-known places in 3 groups of nearby places (a few rounds of k-means), each group a day"""
    p = places[:9]
    if len(p) < 6: return []
    cs = [p[0], max(p, key=lambda x: (x["lat"] - p[0]["lat"]) ** 2 + (x["lng"] - p[0]["lng"]) ** 2)]
    cs.append(max(p, key=lambda x: min((x["lat"] - c["lat"]) ** 2 + (x["lng"] - c["lng"]) ** 2 for c in cs)))
    cs = [{"lat": c["lat"], "lng": c["lng"]} for c in cs]
    for _ in range(8):
        groups = [[] for _ in cs]
        for x in p: groups[min(range(len(cs)), key=lambda i: (x["lat"] - cs[i]["lat"]) ** 2 + (x["lng"] - cs[i]["lng"]) ** 2)].append(x)
        cs = [{"lat": sum(x["lat"] for x in g) / len(g), "lng": sum(x["lng"] for x in g) / len(g)} if g else cs[i] for i, g in enumerate(groups)]
    return [g for g in groups if g]
e = html.escape
def page(c, places):
    he, slug = c["he"], c["slug"]
    days = three_days(places)
    title = f"מסלול טיול ל{he}: מה לראות ורעיון ל-3 ימים | מסע"
    desc = f"תכנון טיול ל{he}, {c['country']}: המקומות הכי מבוקשים ({', '.join(x['name'] for x in places[:4])}), רעיון ל-3 ימים, ומסלול מלא בעברית עם שעות, ארוחות ומפה, בחינם."
    days_html = "".join(f"<li><b>יום {i + 1}:</b> {e(', '.join(x['name'] for x in g))}</li>" for i, g in enumerate(days))
    return f"""<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
{csp}
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{SITE}c/{slug}.html">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="he_IL">
<link rel="icon" href="../icons/icon-192.png">
<link rel="stylesheet" href="../css/fonts.css">
<link rel="stylesheet" href="../css/style.css">
</head>
<body class="docpage">
<main class="doc citypage">
<p><a href="../" class="backlink">מסע: מתכננים טיול בעברית</a> · <a href="index.html">כל הערים</a></p>
<h1>טיול ל{e(he)}</h1>
<p class="lead">{e(he)}, {e(c['country'])}. כאן המקומות הכי מבוקשים בעיר ורעיון לחלוקה לימים. במסע אפשר לקבל תוך כמה שניות מסלול מלא בעברית: שעות, ארוחות במסעדות טובות בדרך, הליכה קצרה בין התחנות, טיסות וגם איפה כדאי לישון.</p>
<p><a class="btn coral" href="../index.html#go={slug}">לבנות מסלול ל{e(he)} עכשיו, בחינם</a></p>
<h2>המקומות הכי מבוקשים ב{e(he)}</h2>
<ol class="cityplaces">{''.join(f"<li><b>{e(x['name'])}</b> <small>{e(x['kind'])}{' · ' + e(x['local']) if x['local'] and x['local'] != x['name'] else ''}</small></li>" for x in places)}</ol>
{f'<h2>רעיון ל-3 ימים ב{e(he)}</h2><p>חילקנו את המקומות האלה לפי המקום שלהם בעיר, כדי ללכת פחות:</p><ul>{days_html}</ul>' if days else ''}
<h2>מסלול מלא ל{e(he)}, מותאם לכם</h2>
<p>במסע בוחרים כמה ימים, עם מי נוסעים ומה אוהבים (אוכל, היסטוריה, טבע, קניות, ילדים, כשרות), והמסלול נבנה לבד: כל יום באזור אחד, ארוחות במקומות טובים בדרך, מה צריך להזמין מראש, ומדריך חכם שעונה על שאלות בזמן הטיול. המסלול עובד גם בלי אינטרנט.</p>
<p><a class="btn" href="../index.html#go={slug}">לתכנן טיול ל{e(he)}</a></p>
<p class="muted small">המידע על המקומות מ-OpenStreetMap ומוויקיפדיה. לפני ביקור כדאי לבדוק שעות פתיחה באתר הרשמי של המקום.</p>
</main>
</body>
</html>
"""
def main():
    out = root / "c"; out.mkdir(exist_ok=True)
    made = []
    for c in cities:
        f = root / "data" / "cities" / f"{c['slug']}.json"
        if not f.exists(): continue
        places = top_places(json.loads(f.read_text()))
        if len(places) < 5:
            # thin data after a failed refresh must not remove a page that is already live
            if (out / f"{c['slug']}.html").exists(): made.append(c)
            continue
        (out / f"{c['slug']}.html").write_text(page(c, places))
        made.append(c)
    for old in out.glob("*.html"):
        if old.stem != "index" and old.stem not in {c["slug"] for c in made}: old.unlink()
    by_country = {}
    for c in made: by_country.setdefault(c["country"], []).append(c)
    link = lambda c: f'<a href="{c["slug"]}.html">{e(c["he"])}</a>'
    items = "".join(f"<li><b>{e(k)}:</b> {' · '.join(link(c) for c in v)}</li>" for k, v in sorted(by_country.items()))
    (out / "index.html").write_text(f"""<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
{csp}
<title>מסלולי טיול ל-{len(made)} ערים בעולם, בעברית | מסע</title>
<meta name="description" content="מסלולי טיול בעברית ל-{len(made)} ערים: מה לראות, רעיון לחלוקה לימים, ומסלול מלא מותאם אישית בחינם.">
<link rel="canonical" href="{SITE}c/">
<link rel="icon" href="../icons/icon-192.png">
<link rel="stylesheet" href="../css/fonts.css">
<link rel="stylesheet" href="../css/style.css">
</head>
<body class="docpage">
<main class="doc citypage">
<p><a href="../" class="backlink">חזרה לאתר מסע</a></p>
<h1>מסלולי טיול בעברית ל-{len(made)} ערים</h1>
<ul class="citylist">{items}</ul>
</main>
</body>
</html>
""")
    today = datetime.date.today().isoformat()
    urls = [SITE, SITE + "c/"] + [f"{SITE}c/{c['slug']}.html" for c in made]
    (root / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"<url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    print(f"city pages: {len(made)}")
if __name__ == "__main__": main()
