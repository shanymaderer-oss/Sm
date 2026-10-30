"""'I have places' with places that are not on our list: a restaurant picked from the map search goes in at its spot,
and a café typed by hand is looked up on the map when building. Both end up in the trip (the map search is simulated)."""
import asyncio, os, sys, json, urllib.parse
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
PLACES = {
    "petit": {"osm_type": "node", "osm_id": 9001, "category": "amenity", "type": "restaurant", "lat": "48.8566", "lon": "2.3065", "name": "Le Petit Cler", "display_name": "Le Petit Cler, 29, Rue Cler, Paris", "address": {"road": "Rue Cler", "house_number": "29"}, "namedetails": {"name": "Le Petit Cler"}},
    "kitsun": {"osm_type": "node", "osm_id": 9002, "category": "amenity", "type": "cafe", "lat": "48.8638", "lon": "2.3364", "name": "Café Kitsuné", "display_name": "Café Kitsuné, 51, Galerie de Montpensier, Paris", "address": {"road": "Galerie de Montpensier", "house_number": "51"}, "namedetails": {"name": "Café Kitsuné"}},
    "merci": {"osm_type": "node", "osm_id": 9003, "category": "shop", "type": "department_store", "lat": "48.8611", "lon": "2.3653", "name": "Merci", "display_name": "Merci, 111, Boulevard Beaumarchais, Paris", "address": {"road": "Boulevard Beaumarchais", "house_number": "111"}, "namedetails": {"name": "Merci"}},
}
async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (the map search is simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; searched = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "nominatim.openstreetmap.org/search" in u:
                q = urllib.parse.parse_qs(urllib.parse.urlparse(u).query).get("q", [""])[0].lower(); searched.append(q)
                return await route.fulfill(json=[v for k, v in PLACES.items() if k in q])
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "פריז"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("[data-mode=mine]")
        # a restaurant from the map search
        await pg.fill("#myIn", "Le Petit"); await pg.wait_for_timeout(1500)
        opts = await pg.locator("#mySug [data-mysug]").all_inner_texts()
        check(any("Le Petit Cler" in o and "מסעדה" in o for o in opts), f"the map search suggests a restaurant, and says it is one ({opts})")
        await pg.locator("#mySug [data-mysug]", has_text="Le Petit Cler").click()
        # a café and a shop typed by hand, without picking
        for n in ["Café Kitsuné", "Merci"]:
            await pg.fill("#myIn", n); await pg.press("#myIn", "Enter")
        check(await pg.locator(".mychip").count() == 3, "three places as chips")
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(500)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        stops = [s for d in t["days"] for s in d["stops"]]
        names = " | ".join(f"{s['name']} {s.get('local') or ''}" for s in stops)
        check("Le Petit Cler" in names, "the picked restaurant is in the trip")
        check("Kitsuné" in names, f"the typed café is in the trip (searched: {searched[-3:]})")
        check("Merci" in names, "the typed shop is in the trip")
        rest = next((s for s in stops if "Petit Cler" in s["name"]), None)
        check(bool(rest) and bool(rest.get("meal")), f"the restaurant is one of the day's meals ({rest and rest.get('meal')})")
        check(not t["wish"].get("missed"), f"nothing is said not found ({t['wish'].get('missed')})")
        # a restaurant on our own list, by part of its name: in English, with an apostrophe, and in Hebrew letters
        for typed, how in [("Le Entrecote", "typed in English"), ("לה אנטריקוט", "typed in Hebrew")]:
            await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
            await pg.fill("#gq", "פריז"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
            await pg.click("[data-mode=mine]")
            await pg.fill("#myIn", typed); await pg.wait_for_timeout(1200)
            opts = await pg.locator("#mySug [data-mysug]").all_inner_texts()
            check(any("Entrecôte" in o for o in opts), f"'{typed}' suggests Le Relais de l'Entrecôte ({opts[:3]})")
            await pg.press("#myIn", "Enter")  # added as typed, not picked
            await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(400)
            t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
            names = " | ".join(s["name"] + " " + (s.get("local") or "") for d in t["days"] for s in d["stops"])
            check("Entrecôte" in names, f"'{typed}' {how} is in the trip (missed: {t['wish'].get('missed')})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
