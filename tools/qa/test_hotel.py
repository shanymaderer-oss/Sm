"""'Where do you sleep?' on the goals screen: the trip starts from that hotel each day and stays closer to it.
Also checks the simpler goals screen: the extras are folded and the mode is explained in one line."""
import asyncio, os, sys, math
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
def km(a, b):
    R = 6371; p1, p2 = math.radians(a["lat"]), math.radians(b["lat"]); dp = p2 - p1; dl = math.radians(b["lng"] - a["lng"])
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))

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
        async def build(hotel):
            await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(700)
            await pg.evaluate("localStorage.removeItem('masa-trips')")
            await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(400)
            if hotel: await pg.fill("#hotelInput", hotel)
            await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(500)
            return await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(700)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(400)
        check(await pg.locator("details.moreprefs:not([open])").count() == 1, "budget, food, transport, access and pace are folded under 'more'")
        check(await pg.locator("#hotelInput").is_visible(), "'where do you sleep' is on the goals screen")
        await pg.click("[data-mode=self]")
        check("מחליטים" in await pg.inner_text("#modeHint"), "the chosen way to build is explained in one line")
        base = await build("")
        t = await build("Hotel della Conciliazione")
        h = t.get("hotel")
        check(bool(h) and "Conciliazione" in h["name"], f"the hotel is found ({h and h['name']})")
        firsts = [d["stops"][0] for d in t["days"]]
        check(all(s.get("meal") == "hotel" for s in firsts), "every day starts from the hotel")
        if h:
            avg = lambda tr: sum(km(h, s) for d in tr["days"] for s in d["stops"] if s.get("meal") != "hotel") / max(1, sum(1 for d in tr["days"] for s in d["stops"] if s.get("meal") != "hotel"))
            a0, a1 = avg(base), avg(t)
            check(a1 < a0, f"the trip stays closer to the hotel ({a0:.2f} km on average without it, {a1:.2f} with it)")
        t2 = await build("Hotel Nowhere Imaginary 123")
        check(not t2.get("hotel") and "לא מצאנו" in await pg.inner_text(".screen"), "a hotel we cannot find is said plainly, and the trip is still built")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
