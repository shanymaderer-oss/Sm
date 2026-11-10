"""The beta question under the trip ("איך המסלול?"): shown on a trip the traveler built, not on the sample; one tap answers
it (good / not really) and then asks for a few optional words; a failed send says so; "not now" hides it for the session.
Under it, "send the trip to who is coming along" opens WhatsApp with a link that counts as a share."""
import asyncio, os, sys
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (sending is blocked here)"); return
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
        await pg.click("#sampleBtn"); await pg.wait_for_selector(".triphero", timeout=20000); await pg.wait_for_timeout(300)
        check(await pg.locator("#askCard").count() == 0, "no question on the sample trip")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(800)
        check(await pg.locator("#askCard").count() == 1 and "איך המסלול" in await pg.inner_text("#askCard"), "a built trip asks how the route is")
        check(await pg.locator("#askGood").count() == 1 and await pg.locator("#askBad").count() == 1, "one tap: good or not really")
        await pg.click("#askBad"); await pg.wait_for_timeout(1500)
        check("לא הצלחנו" in await pg.inner_text("#askStatus") and await pg.locator("#askBad").is_enabled(), "a failed send says so and the buttons work again")
        check(await pg.locator("#shareCard").count() == 1 and "וואטסאפ" in await pg.inner_text("#shareCard"), "under the trip: send it to who is coming along, WhatsApp first")
        await ctx.route("https://wa.me/**", lambda route: route.fulfill(body="ok", content_type="text/plain"))
        async with ctx.expect_page() as np:
            await pg.click("#shareWa")
        w = await np.value; await w.wait_for_load_state()
        from urllib.parse import unquote
        wa = unquote(w.url); await w.close()
        check("wa.me" in wa and "utm_source=share" in wa and "#t=" in wa, f"WhatsApp opens with the trip link ({wa[:90]})")
        check("נשלח" in await pg.inner_text("#shareCard"), "after sending, the card says so")
        await pg.click("#askNo"); await pg.wait_for_timeout(300)
        check(await pg.locator("#askCard").count() == 0, "'not now' hides it")
        await pg.click(".daytab >> nth=1"); await pg.wait_for_timeout(400)
        check(await pg.locator("#askCard").count() == 0, "and it stays away for the session")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
