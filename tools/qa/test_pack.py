"""The packing list: made for the trip (days, season, who travels, the route, the country's plugs), ticks and own
items stay after a reload, and it works for a trip without a forecast."""
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
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            if u.startswith(URL) or "localhost" not in URL: return await route.continue_()
            return await route.abort()
        await pg.route("**/*", r)
        # a winter trip to London with children, keeping kosher
        await pg.add_init_script("try { localStorage.setItem('masa-me', JSON.stringify({ form: { start: '2027-01-12', days: 4, people: 4 } })) } catch {}")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "לונדון"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.fill("#notes", "זוג עם שני ילדים, שומרים כשרות ושבת"); await pg.wait_for_timeout(600)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(500)
        await pg.click("[data-folder=before]"); await pg.wait_for_selector("#packCard")
        await pg.click("#packCard"); await pg.wait_for_selector(".pack", timeout=10000)
        txt = await pg.inner_text(".screen")
        check("מה לארוז ללונדון" in txt and "דרכון" in txt and "5 חולצות" in txt, "a list for this trip: London, 4 days -> 5 shirts")
        check("מעיל חם" in txt and "לפי העונה" in txt, "January in London, no forecast yet: a warm coat, and it says it goes by the season")
        check("לילדים" in txt and "לשבת" in txt and "נרות שבת" in txt, "children and Shabbat get their own sections")
        check("מתאם לשקע (סוג G)" in txt, "the UK's plugs: an adapter is needed")
        # tick, add, reload: kept
        await pg.click("[data-pk=passport]"); await pg.wait_for_timeout(200)
        await pg.fill("#packIn", "מצלמה"); await pg.press("#packIn", "Enter"); await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_timeout(800)
        await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero"); await pg.click("[data-folder=before]"); await pg.click("#packCard"); await pg.wait_for_selector(".pack")
        check(await pg.is_checked("[data-pk=passport]") and "מצלמה" in await pg.inner_text(".screen") and "שהוספתם" in await pg.inner_text(".screen"), "a tick and an added item stay after a reload")
        await pg.click("[data-pdel='0']"); await pg.wait_for_timeout(300)
        check("מצלמה" not in await pg.inner_text(".screen"), "an added item can be removed")
        await pg.click("#backPack"); await pg.wait_for_selector("#packCard")
        check(await pg.locator("[data-folder=before][aria-selected=true]").count() == 1, "back goes to 'before the flight'")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
