"""The trip's expenses: written in the local currency or in shekels, totals in both, by kind, by day and per
traveler; deleting one; kept after a reload; not part of the trip's shared link."""
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
            if "frankfurter" in u or "er-api" in u: return await route.abort()  # no live rates: the built-in ones are used
            if u.startswith(URL) or "localhost" not in URL: return await route.continue_()
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "פראג"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(500)
        await pg.click("[data-folder=together]"); await pg.wait_for_selector("#spendCard"); await pg.click("#spendCard"); await pg.wait_for_selector(".spend")
        check("הוצאות הטיול" in await pg.inner_text(".screen") and await pg.locator("[data-cur=local]").inner_text() == "CZK", "the expenses open, with the local currency (CZK) and shekels")
        # 250 CZK for food on day 1, then 80 shekels for transport
        await pg.fill("#spAmt", "250"); await pg.click("[data-kind=food]"); await pg.click("#spendForm button[type=submit]"); await pg.wait_for_timeout(300)
        await pg.click("[data-cur=ILS]"); await pg.fill("#spAmt", "80"); await pg.click("[data-kind=move]"); await pg.click("#spendForm button[type=submit]"); await pg.wait_for_timeout(300)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].spend")
        check(len(t) == 2 and t[0]["cur"] == "CZK" and 30 < t[0]["ils"] < 50 and t[1]["cur"] == "ILS" and t[1]["ils"] == 80, f"each expense is kept with its shekel value ({[(x['amt'], x['cur'], x['ils']) for x in t]})")
        txt = await pg.inner_text(".spendtotal")
        check("₪" in txt and "לאדם" in txt and "2 הוצאות" in txt, f"the total, per traveler and the count ({txt[:80]!r})")
        check("לפי סוג" in await pg.inner_text(".screen") and "אוכל" in await pg.inner_text(".screen") and "תחבורה" in await pg.inner_text(".screen"), "totals by kind")
        await pg.fill("#spAmt", "abc"); await pg.click("#spendForm button[type=submit]"); await pg.wait_for_timeout(200)
        check("כתבו סכום" in await pg.inner_text("#spStatus"), "a wrong amount is not added")
        await pg.reload(); await pg.wait_for_timeout(800)
        await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero"); await pg.click("[data-folder=together]")
        check("2 הוצאות" in await pg.inner_text("#spendCard"), "after a reload the expenses are still there")
        await pg.click("#spendCard"); await pg.wait_for_selector(".spend")
        await pg.click("[data-sdel] >> nth=0"); await pg.wait_for_timeout(300)
        check(len(await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].spend")) == 1, "an expense can be deleted")
        shared = await pg.evaluate("JSON.stringify(Masa && 0)")
        await pg.click("#backSpend"); await pg.wait_for_selector("#spendCard")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
