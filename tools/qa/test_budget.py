"""Restaurants by budget (2026-11-09, by the owner's choice): a mid-budget trip plans no upscale restaurant
(a Michelin star, a "fine" pick, a Wikivoyage splurge), and swapping a meal offers one, marked "יוקרתי".
A splurge trip still plans them. Must end with FAILS: []."""
import asyncio, os
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print("ok " if ok else "BAD", what)
    if not ok: FAILS.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 400, "height": 860})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_function("window.Masa&&Masa.planner")
        build = """async ([q, bud]) => { const t = await Masa.planner.build({ query: q, days: 3, interests: ["history", "food"], budget: bud, pace: "מאוזן", diet: "הכול", move: "walk", notes: "", start: "2026-12-07", people: 2 }, () => {}, null);
          const up = new Set(t.places.filter(p => p.up).map(p => p.name));
          return t.days.flatMap(d => d.stops.filter(s => (s.meal === "lunch" || s.meal === "dinner") && up.has(s.name)).map(s => s.name)); }"""
        for city in ["ניו יורק", "פריז", "לונדון"]:
            mid = await pg.evaluate(build, [city, "בינוני"])
            check(mid == [], f"{city}, mid budget: no upscale meal ({mid})")
        top = await pg.evaluate(build, ["ניו יורק", "מפנק"])
        check(len(top) >= 2, f"ניו יורק, splurge budget: upscale meals stay ({top})")

        # the screen: a mid-budget New York trip, swap a dinner
        await pg.fill("#gq", "ניו יורק"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn")
        await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_timeout(800)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        check(t["opts"].get("budget") == "בינוני", "the default budget is mid")
        i = next((k for k, s in enumerate(t["days"][0]["stops"]) if s.get("meal") == "dinner"), None)
        check(i is not None, "day 1 has a dinner")
        await pg.click("#editDay"); await pg.wait_for_timeout(300)
        await pg.click(f".editbar[data-i='{i}'] [data-repl]"); await pg.wait_for_timeout(300)
        alts = await pg.locator(".altlist .hrow").all_inner_texts()
        check(any("יוקרתי" in a for a in alts), f"the dinner swap offers an upscale restaurant ({[a.splitlines()[0] for a in alts]})")
        j = next(k for k, a in enumerate(alts) if "יוקרתי" in a) if any("יוקרתי" in a for a in alts) else 0
        await pg.click(f"[data-alt='{j}']"); await pg.wait_for_timeout(500)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        s = t["days"][0]["stops"][i]
        check(s.get("meal") == "dinner" and s.get("cost") == "יוקרתי", f"the chosen restaurant stays dinner and says it is upscale ({s.get('name')}, {s.get('cost')})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)

asyncio.run(main())
