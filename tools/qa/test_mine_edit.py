"""'I have places' and changing the day on the spot.
Add places (a suggestion, typed names, a neighborhood) -> the trip is built around them with our recommendations ->
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
        await pg.click("[data-mode=mine]")
        check(await pg.locator("#myPlaces").is_visible() and "סביבם" in await pg.inner_text("#modeHint"), "'I have places' opens a places field and says what it does")
        check(await pg.locator("[data-mode]").count() == 2, "two ways to build: 'build for me' and 'I have places'")
        # a suggestion from the city's places, and two typed by hand (one in Hebrew, one a neighborhood)
        await pg.fill("#myIn", "פנתא"); await pg.wait_for_timeout(700)
        sug = await pg.locator("#mySug [data-mysug]").all_inner_texts()
        check(any("פנתאון" in x for x in sug), f"typing suggests the city's places ({sug[:3]})")
        await pg.click("#mySug [data-mysug] >> nth=0")
        for name in ["מזרקת טרווי", "טרסטוורה"]:
            await pg.fill("#myIn", name); await pg.press("#myIn", "Enter")
        chips = await pg.locator(".mychip").all_inner_texts()
        check(len(chips) == 3, f"each place shows as a chip ({chips})")
        await pg.fill("#myIn", "מזרקת טרווי"); await pg.press("#myIn", "Enter")
        check(await pg.locator(".mychip").count() == 3, "the same place is not added twice")
        await pg.click(".mychip >> nth=2 >> button"); await pg.wait_for_timeout(100)
        await pg.fill("#myIn", "טרסטוורה"); await pg.click("#myAdd")
        check("3 מקומות שלי" in await pg.inner_text("#buildBtn"), "the button says the trip is built around my places")
        await pg.click("#buildBtn")
        await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_timeout(800)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        allnames = " | ".join(f"{s['name']} {s.get('local') or ''}" for d in t["days"] for s in d["stops"])
        check("Pantheon" in allnames or "פנתאון" in allnames, "the suggested place is in the trip")
        check("Trevi" in allnames or "טרווי" in allnames, "the typed place is in the trip")
        check("Trastevere" in allnames or "טרסטוורה" in allnames or not t["wish"].get("missed"), f"the neighborhood is in the trip, or said not found ({t['wish'].get('missed')})")
        own = sum(1 for d in t["days"] for s in d["stops"] if not s.get("meal") and not s.get("asked"))
        check(own >= 4, f"our recommendations fill the rest of the days ({own} more places)")
        check(t["opts"].get("mine") and len(t["opts"]["mine"]) == 3, "the trip keeps the places it was built around")

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
