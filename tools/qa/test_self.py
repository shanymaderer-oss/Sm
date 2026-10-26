"""'I build it myself': the traveler puts places on days, with our suggestions (what is close, where to eat) for each day.
The built trip keeps every place on the day it was put on, a chosen restaurant becomes a meal of that day,
and the days are ordered by distance. Also: shopping means streets and markets, not single shops, unless asked."""
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
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page()
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
        await pg.click("[data-mode=self]")
        await pg.click("#buildBtn")
        await pg.wait_for_selector(".selfdays", timeout=20000)
        tabs = await pg.locator("[data-sd]").count()
        check(tabs == 3, f"a tab for each day ({tabs})")
        check(not await pg.is_checked("#pickFill"), "building alone does not fill the days unless asked")
        want = {}
        # day 1: two places from the list, then a restaurant we recommend near them
        for _ in range(2):
            row = pg.locator(".pickgroup[open] .pickrow").first
            want[await row.get_attribute("data-pick")] = 0
            await row.click(); await pg.wait_for_timeout(250)
        sugg = await pg.evaluate("[...document.querySelectorAll('.selfday .nearpicks small')].map(s => s.innerText)")
        check(any("מסעדות" in s for s in sugg), f"restaurants we recommend for the day are offered ({sugg})")
        check(any("קרוב" in s for s in sugg), "places close to the day are offered")
        rest = pg.locator(".selfday .nearpicks:has(small:text-matches('מסעדות')) .pickrow").first
        rid = await rest.get_attribute("data-pick"); want[rid] = 0
        await rest.click(); await pg.wait_for_timeout(250)
        # day 2: one place
        await pg.click("[data-sd='1']"); await pg.wait_for_timeout(200)
        row = pg.locator(".pickgroup[open] .pickrow").first
        want[await row.get_attribute("data-pick")] = 1
        await row.click(); await pg.wait_for_timeout(250)
        # move the first place of day 1 to day 3
        await pg.click("[data-sd='0']"); await pg.wait_for_timeout(200)
        mv = pg.locator("[data-pickday][data-to='2']").first
        mid = await mv.get_attribute("data-pickday"); want[mid] = 2
        await mv.click(); await pg.wait_for_timeout(250)
        check(await pg.locator(".selfday .pickrow[aria-pressed=true]").count() == 2, "after moving, day 1 has the other place and the restaurant")
        await pg.screenshot(path=os.environ.get("QA_OUT", "/tmp/masa-qa/") + "self.png")
        await pg.click("#pickBuild")
        await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(800)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        where = {s.get("osm") or s.get("id"): (di, s) for di, d in enumerate(t["days"]) for s in d["stops"]}
        for pid, d in want.items():
            got = where.get(pid)
            check(got is not None and got[0] == d, f"{pid} is on day {d + 1} (got {got[0] + 1 if got else None})")
        g = where.get(rid)
        check(g and g[1].get("meal") in ("lunch", "dinner"), f"the chosen restaurant is a meal ({g and g[1].get('meal')})")
        day1 = [s for s in t["days"][0]["stops"] if not s.get("meal") and not s.get("isHotel")]
        check(len(day1) <= 2, f"without 'fill', day 1 has only what was put on it ({[s['name'] for s in day1]})")
        # shopping: streets and markets, not single shops
        shops = []
        for city, notes in [("לונדון", "אוהבים קניות"), ("פריז", "קניות ואוכל"), ("ברצלונה", "")]:
            trip = await pg.evaluate("""async ([q, notes]) => await Masa.planner.build({ query: q, days: 3, interests: ["shopping", "food", "history"], budget: "בינוני", pace: "מאוזן", diet: "הכול", move: "walk", notes, start: "2026-12-01", people: 2 }, () => {}, null)""", [city, notes])
            shops += [f"{city}: {s['name']} ({s['kind']})" for d in trip["days"] for s in d["stops"] if s.get("kind") in ("shop", "store", "mall", "deli")]
            if city == "לונדון": streets = [s["name"] for d in trip["days"] for s in d["stops"] if s.get("kind") in ("street", "market")]
        check(not shops, f"no single shops when not asked ({shops[:4]})")
        check(len(streets) > 0, f"shopping comes as streets and markets ({streets[:3]})")
        trip = await pg.evaluate("""async () => await Masa.planner.build({ query: "לונדון", days: 3, interests: ["shopping"], budget: "בינוני", pace: "מאוזן", diet: "הכול", move: "walk", notes: "רוצים גם קניון ואאוטלט", start: "2026-12-01", people: 2 }, () => {}, null)""")
        malls = [s["name"] for d in trip["days"] for s in d["stops"] if s.get("kind") in ("mall", "store")]
        check(len(malls) > 0, f"asked for a mall: malls come in ({malls[:3]})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
