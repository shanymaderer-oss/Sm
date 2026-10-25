"""Live check of everything the site talks to, with the real network (run on GitHub Actions, where the internet is open).
1. Uses the live site like a traveler: a ready city (Rome) and a city without ready data (Thessaloniki, so Overpass,
   Nominatim and Wikivoyage are used live), a place page, info, transport, hotels, discover, settings.
   Records every request that failed and every Content-Security-Policy block (a service our CSP forgot).
2. Collects every outgoing link on those screens and checks that it answers (many big sites refuse robots: that is
   reported separately from real breakage).
3. Calls each data service directly once, as the site does.
Writes qa-out/live.json and prints a summary. Exit code 1 when something the traveler needs is broken."""
import asyncio, json, os, sys, time, urllib.request, urllib.error, ssl
from collections import defaultdict
from urllib.parse import urlparse
from playwright.async_api import async_playwright

URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
OUT = os.environ.get("QA_OUT", "qa-out/")
os.makedirs(OUT, exist_ok=True)
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"
R = {"failed": defaultdict(list), "csp": [], "pageerrors": [], "screens": {}, "links": {}, "services": {}}

async def browse():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, user_agent=UA, locale="he-IL")
        pg = await ctx.new_page()
        def on_resp(r):
            if r.status >= 400: R["failed"][urlparse(r.url).hostname].append(f"{r.status} {r.url[:160]}")
        pg.on("response", on_resp)
        pg.on("requestfailed", lambda q: R["failed"][urlparse(q.url).hostname].append(f"FAILED {q.failure} {q.url[:160]}"))
        pg.on("console", lambda m: R["csp"].append(m.text[:300]) if "Content Security Policy" in m.text or "Trusted Type" in m.text else None)
        pg.on("pageerror", lambda e: R["pageerrors"].append(str(e)[:300]))
        links = set()
        async def grab(name):
            await pg.wait_for_timeout(1500)
            txt = (await pg.inner_text("#screen"))[:400].replace("\n", " / ")
            R["screens"][name] = txt
            for h in await pg.evaluate("[...document.querySelectorAll('#screen a[href]')].map(a => a.href)"):
                if h.startswith("http") and URL not in h: links.add(h)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(4000)
        await grab("home")
        for city, notes in [("רומא", "עם ילדים, חייבים לראות את הקולוסיאום"), ("סלוניקי, יוון", "")]:
            await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(2500)
            await pg.fill("#gq", city); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(800)
            if notes: await pg.fill("#notes", notes)
            t0 = time.time()
            await pg.click("#buildBtn")
            try:
                await pg.wait_for_selector(".triphero", timeout=60000)
                R["screens"][f"build {city} seconds"] = round(time.time() - t0, 1)
            except Exception:
                R["screens"][f"build {city}"] = "FAILED: " + (await pg.inner_text("#screen"))[:300]
                continue
            await pg.wait_for_timeout(12000)  # stories, photos and routes arrive in the background
            await grab(f"plan {city}")
            R["screens"][f"photos {city}"] = await pg.evaluate("document.querySelectorAll('.stop .thumb').length")
            R["screens"][f"routes {city}"] = await pg.evaluate("document.querySelectorAll('.leg').length")
            await pg.click("button.stop >> nth=1"); await grab(f"place {city}")
            await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(600)
            for sel, name in [("#infoCard", "info"), ("#moveCard", "move"), ("#hotelCard", "hotels")]:
                try:
                    await pg.click(sel); await grab(f"{name} {city}")
                    await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(500)
                except Exception as e: R["screens"][f"{name} {city}"] = f"FAILED {e}"[:200]
            for k in ["discover", "book", "guide"]:
                try: await pg.click(f"#nav button[data-k={k}]"); await grab(f"{k} {city}")
                except Exception as e: R["screens"][f"{k} {city}"] = f"FAILED {e}"[:200]
            try:
                await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(500)
                await pg.click("#gchips button >> nth=1"); await grab(f"list {city}")
                await pg.click(".pmain >> nth=0"); await grab(f"poi {city}")
            except Exception as e: R["screens"][f"list {city}"] = f"FAILED {e}"[:200]
        await b.close()
    return links

def fetch(u, method="GET", headers=None, data=None, timeout=20):
    req = urllib.request.Request(u, method=method, data=data, headers={"User-Agent": UA, "Accept": "*/*", "Accept-Language": "he,en", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
            return r.status, r.read(400000)
    except urllib.error.HTTPError as e: return e.code, b""
    except Exception as e: return 0, str(e).encode()[:200]

def check_links(links):
    by = defaultdict(list)
    for u in sorted(links): by[urlparse(u).hostname].append(u)
    for host, us in by.items():
        res = []
        for u in us[:4]:  # a few per site is enough
            code, _ = fetch(u)
            res.append((code, u[:180]))
            time.sleep(0.4)
        R["links"][host] = res

SERVICES = [
    ("OpenFreeMap style", "https://tiles.openfreemap.org/styles/liberty", None),
    ("Esri satellite tile", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/4", None),
    ("OSM tile (fallback)", "https://tile.openstreetmap.org/3/4/3.png", None),
    ("Nominatim", "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Thessaloniki", None),
    ("OSRM foot", "https://routing.openstreetmap.de/routed-foot/route/v1/driving/12.4922,41.8902;12.4768,41.8986?overview=false", None),
    ("OSRM car", "https://routing.openstreetmap.de/routed-car/route/v1/driving/12.4922,41.8902;12.4768,41.8986?overview=false", None),
    ("Wikipedia summary he", "https://he.wikipedia.org/api/rest_v1/page/summary/%D7%94%D7%A7%D7%95%D7%9C%D7%95%D7%A1%D7%99%D7%90%D7%95%D7%9D", None),
    ("Wikipedia geosearch", "https://en.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&origin=*&gslimit=5&gsradius=1000&gscoord=41.89|12.49", None),
    ("Wikidata", "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels&languages=he&ids=Q10285", None),
    ("Wikivoyage", "https://en.wikivoyage.org/w/api.php?action=parse&page=Thessaloniki&prop=wikitext&formatversion=2&format=json&redirects=1&origin=*", None),
    ("Open-Meteo", "https://api.open-meteo.com/v1/forecast?latitude=41.9&longitude=12.5&daily=temperature_2m_max&timezone=auto", None),
    ("Frankfurter", "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=ILS", None),
    ("ExchangeRate (fallback)", "https://open.er-api.com/v6/latest/EUR", None),
    ("Gemini (no key: must answer 400/403)", "https://generativelanguage.googleapis.com/v1beta/models", None),
]
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

def check_services():
    for name, u, _ in SERVICES:
        t0 = time.time(); code, body = fetch(u)
        if code == 0: time.sleep(3); code, body = fetch(u)  # one retry for a slow answer
        R["services"][name] = {"status": code, "ms": int((time.time() - t0) * 1000), "bytes": len(body)}
        time.sleep(1.1)
    q = '[out:json][timeout:20];node["amenity"="restaurant"](40.62,22.93,40.64,22.95);out 5;'
    for u in OVERPASS:
        t0 = time.time(); code, body = fetch(u, "POST", {"Content-Type": "application/x-www-form-urlencoded"}, ("data=" + urllib.parse.quote(q)).encode(), 40)
        R["services"]["Overpass " + urlparse(u).hostname] = {"status": code, "ms": int((time.time() - t0) * 1000), "bytes": len(body)}

def main():
    links = asyncio.run(browse())
    check_links(links)
    check_services()
    R["failed"] = {h: v[:6] for h, v in R["failed"].items()}
    json.dump(R, open(os.path.join(OUT, "live.json"), "w"), ensure_ascii=False, indent=1)
    bad = []
    live_build_ok = isinstance(R["screens"].get("build סלוניקי, יוון seconds"), (int, float))
    for name, s in R["services"].items():
        if name.startswith("Overpass") and live_build_ok: continue  # mirrors vary; the site's own fallback order worked
        ok = s["status"] in (400, 403) if "Gemini" in name else 200 <= s["status"] < 400
        if not ok: bad.append(f"service {name}: {s['status']}")
    for k, v in R["screens"].items():
        if isinstance(v, str) and v.startswith("FAILED"): bad.append(f"screen {k}: {v[:120]}")
    bad += [f"CSP: {c}" for c in R["csp"][:5]] + [f"page error: {e}" for e in R["pageerrors"][:5]]
    broken_links = [f"{h}: {c} {u}" for h, res in R["links"].items() for c, u in res if c in (0, 404, 410) or c >= 500]
    print(json.dumps({"services": R["services"], "screens": R["screens"], "failed_requests": R["failed"], "csp": R["csp"], "pageerrors": R["pageerrors"],
                      "links": {h: [c for c, _ in r] for h, r in R["links"].items()}}, ensure_ascii=False, indent=1))
    print("BROKEN LINKS:", broken_links)
    print("PROBLEMS:", bad)
    sys.exit(1 if bad else 0)
import urllib.parse
main()
