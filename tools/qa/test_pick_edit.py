"""'I'll choose' and changing the day on the spot.
Pick mode lists the city's places -> mark 3 and one 'close to it' -> the trip has all of them ->
edit the day: move a stop, remove one, replace one with a nearby alternative, move one to another day, re-order by distance."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 400, "height": 860})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500)
        await pg.click("[data-mode=pick]")
        check((await pg.inner_text("#buildBtn")).startswith("המשך"), "the button says it continues to choosing")
        await pg.click("#buildBtn")
        await pg.wait_for_selector(".pickgroup", timeout=20000)
        groups = await pg.evaluate("[...document.querySelectorAll('.pickgroup summary')].map(s => s.innerText)")
        check(len(groups) >= 5, f"places are grouped by kind ({len(groups)} groups)")
        ids = []
        for i in range(3):
            row = pg.locator(".pickgroup[open] .pickrow").first
            ids.append(await row.get_attribute("data-pick"))
            await row.click(); await pg.wait_for_timeout(250)
        check(await pg.evaluate("document.querySelectorAll('.picked > .pickrow[aria-pressed=true]').length") == 3, "three places are marked")
        near = pg.locator(".nearpicks .pickrow").first
        if await near.count():
            ids.append(await near.get_attribute("data-pick"))
            await near.click(); await pg.wait_for_timeout(250)
            check(True, "a place 'close to it' can be added")
        else:
            check(False, "a place 'close to it' is offered")
        await pg.screenshot(path=os.environ.get("QA_OUT", "/tmp/masa-qa/") + "pick.png")
        await pg.click("#pickBuild")
        await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(800)
        in_trip = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].days.flatMap(d => d.stops.map(s => s.osm))")
        missing = [n for n in ids if n not in in_trip]
        check(not missing, f"every chosen place is in the trip (missing: {missing})")

        # changing the day on the spot
        await pg.click("#editDay"); await pg.wait_for_timeout(300)
        check(await pg.locator(".editbar").count() > 3, "edit controls appear under the stops")
        before = await pg.evaluate("[...document.querySelectorAll('button.stop .t')].map(e => e.innerText)")
        await pg.click(".editbar [data-down] >> nth=1"); await pg.wait_for_timeout(400)
        after = await pg.evaluate("[...document.querySelectorAll('button.stop .t')].map(e => e.innerText)")
        check(before[1] == after[2] and before[2] == after[1], "a stop moves down")
        check(await pg.locator("#orderDay").count() == 1, "after moving by hand, 'order by distance' is offered")
        n0 = len(after)
        await pg.click(".editbar [data-del] >> nth=2"); await pg.wait_for_timeout(400)
        check(await pg.locator("button.stop").count() == n0 - 1, "a stop is removed")
        await pg.click(".editbar [data-repl] >> nth=1"); await pg.wait_for_timeout(300)
        if await pg.locator("[data-alt]").count():
            old = (await pg.evaluate("[...document.querySelectorAll('button.stop .t')].map(e => e.innerText)"))
            await pg.click("[data-alt] >> nth=0"); await pg.wait_for_timeout(500)
            new = (await pg.evaluate("[...document.querySelectorAll('button.stop .t')].map(e => e.innerText)"))
            check(old != new, "a stop is replaced with a nearby alternative")
        else:
            check(False, "nearby alternatives are offered")
        sel = pg.locator("select[data-mv='1']")
        moved = await pg.evaluate("document.querySelectorAll('button.stop .t')[1].innerText")
        await sel.select_option(index=1); await pg.wait_for_timeout(500)
        day2 = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].days[1].stops.map(s => s.name)")
        check(moved in day2, "a stop moves to another day")
        await pg.click("#orderDay"); await pg.wait_for_timeout(500)
        times = await pg.evaluate("[...document.querySelectorAll('button.stop .meta')].map(e => e.innerText.split('\\n')[0])")
        check(times == sorted(times), f"after ordering, times go forward ({times})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
