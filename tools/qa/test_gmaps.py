"""The trip in Google Maps: each day opens its stops in order in Google Maps (at most 8 stops between start and end in a
link), and the whole trip downloads as a KML file for Google My Maps, every stop named by day and order."""
import asyncio, os, sys, re
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block", accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500)
        await Q.to_goals(pg); await pg.click("#buildBtn")
        await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_timeout(800)
        trip = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        n0 = len(trip["days"][0]["stops"])
        links = await pg.eval_on_selector_all('a[data-gm="day"]', "a => a.map(x => x.href)")
        check(len(links) >= 1, f"the day has a Google Maps link ({len(links)} for {n0} stops)")
        ok = True; points = 0
        for i, u in enumerate(links):
            q = parse_qs(urlparse(u).query)
            wp = q.get("waypoints", [""])[0].split("|") if q.get("waypoints") else []
            ok = ok and urlparse(u).netloc == "www.google.com" and "origin" in q and "destination" in q and len(wp) <= 8 and q.get("travelmode") == ["walking"]
            points += len(wp) + (2 if i == 0 else 1)
        check(ok, "each link has a start, an end, at most 8 stops between, walking")
        check(points == n0, f"together the links cover every stop of the day once ({points} of {n0})")
        await pg.click('[data-folder="before"]'); await pg.wait_for_selector("#gmapsCard", timeout=8000)
        await pg.click("#gmapsCard"); await pg.wait_for_selector("#getKml", timeout=8000)
        check("My Maps" in await pg.inner_text("#panel"), "the screen explains the import into My Maps")
        async with pg.expect_download() as dl:
            await pg.click("#getKml")
        d = await dl.value
        path = await d.path(); kml = open(path, encoding="utf-8").read()
        check(d.suggested_filename.endswith(".kml") and kml.startswith("<?xml"), f"a KML file downloads ({d.suggested_filename})")
        stops = sum(len(x["stops"]) for x in trip["days"])
        marks = len(re.findall(r"<Point>", kml))
        check(marks == stops, f"every stop is in the file ({marks} of {stops})")
        check(kml.count("<Folder>") == len(trip["days"]) and "יום 1 · 1." in kml, "a folder for each day, stops named by day and order")
        await pg.click("#backBefore"); await pg.wait_for_timeout(400)
        check(await pg.locator("#gmapsCard").count() == 1, "back returns to the trip")
        errs2 = [e for e in errs if "network-request-failed" not in e and "Failed to fetch" not in e]
        check(not errs2, f"no page errors {errs2[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
