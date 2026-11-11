"""Adult venues (a sex museum, a strip club, an erotic shop) never enter a route: New York and Porto both have a
'Museum of Sex' in their map data, and a 3-day trip in each leaves it out."""
import asyncio, os, sys, re, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
ADULT = re.compile(r"\b(sex|sexo|erotic|strip ?club)\b|מוזיאון המין", re.I)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for city in ["ניו יורק", "פורטו"]:
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
            await pg.fill("#gq", city); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500)
            await Q.to_goals(pg); await pg.click("#buildBtn")
            await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(800)
            trip = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
            names = [f"{s.get('name','')} {s.get('local','')}" for d in trip["days"] for s in d["stops"]]
            bad = [n for n in names if ADULT.search(n)]
            check(len(names) > 10 and not bad, f"{city}: {len(names)} stops, no adult venue {bad[:2]}")
            errs2 = [e for e in errs if "network-request-failed" not in e and "Failed to fetch" not in e]
            check(not errs2, f"{city}: no page errors {errs2[:2]}")
            await ctx.close()
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
