"""From inside a trip, the flights and where-to-sleep screens are always one tap away (the 'before' folder and the top
of the bookings), with the trip's city and dates, a way back to the trip, and 'build the route around this place'."""
import asyncio, os, sys
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
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
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

        await pg.click('[data-folder="before"]'); await pg.wait_for_selector("#flightsCard", timeout=8000)
        check(await pg.locator("#stayCard").count() == 1, "the 'before' folder has flights and where-to-sleep")
        await pg.click("#flightsCard"); await pg.wait_for_selector("#flights", timeout=10000)
        txt = await pg.inner_text("#panel")
        check("הטיסות של הטיול" in txt and "רומא" in txt, "the flights screen opens with the trip's city")
        check(await pg.locator("#whenNext").count() == 0 and await pg.locator("#quickBuild").count() == 0, "no 'next step' buttons inside a trip")
        check(not await pg.locator("#nav").is_hidden(), "the trip's bottom bar stays")
        await pg.click("#toStay"); await pg.wait_for_selector("#bases .base, #bases", timeout=10000); await pg.wait_for_timeout(1500)
        check("איפה לישון" in await pg.inner_text("#panel"), "from flights straight to where to sleep")
        n = await pg.locator("[data-base]").count()
        check(n >= 1, f"suggested areas to sleep ({n})")
        if n:
            await pg.click('[data-base="0"]'); await pg.wait_for_timeout(400)
            check(await pg.locator("#stayApply").is_visible(), "choosing an area offers to build the route around it")
            await pg.click("#stayApply"); await pg.wait_for_selector('[data-folder="plan"][aria-selected="true"], .triphero', timeout=30000); await pg.wait_for_timeout(1500)
            hotel = await pg.evaluate("(JSON.parse(localStorage.getItem('masa-trips')||'[]')[0]||{}).hotel")
            check(bool(hotel and hotel.get("lat")), "the trip is rebuilt around the chosen place")
        await pg.click('[data-folder="before"]'); await pg.wait_for_selector("#stayCard", timeout=8000)
        await pg.click("#stayCard"); await pg.wait_for_selector("#backTrip", timeout=10000)
        await pg.click("#backTrip"); await pg.wait_for_timeout(500)
        check(await pg.locator("#flightsCard").count() == 1, "back from where-to-sleep returns to the trip")
        await pg.click('[data-folder="book"]'); await pg.wait_for_selector("#bkFlights", timeout=10000)
        check(await pg.locator("#bkStay").count() == 1, "the bookings folder opens with flights and where-to-sleep on top")
        await pg.click("#bkFlights"); await pg.wait_for_selector("#flights", timeout=10000)
        check(True, "flights from the bookings folder")
        errs2 = [e for e in errs if "network-request-failed" not in e and "Failed to fetch" not in e]
        check(not errs2, f"no page errors {errs2[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
