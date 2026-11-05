"""The beta question under the trip ("איך המסלול?"): shown on a trip the traveler built, not on the sample; an empty answer
asks for a few words; a failed send says so and keeps the text; "not now" hides it for the session."""
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
        await pg.click("#askSend"); await pg.wait_for_timeout(300)
        check("כמה מילים" in await pg.inner_text("#askStatus"), "an empty answer asks for a few words")
        await pg.fill("#askText", "היום השני עמוס מדי"); await pg.click("#askSend"); await pg.wait_for_timeout(1500)
        check("לא הצלחנו" in await pg.inner_text("#askStatus") and await pg.input_value("#askText") == "היום השני עמוס מדי", "a failed send says so and keeps the text")
        await pg.click("#askNo"); await pg.wait_for_timeout(300)
        check(await pg.locator("#askCard").count() == 0, "'not now' hides it")
        await pg.click(".daytab >> nth=1"); await pg.wait_for_timeout(400)
        check(await pg.locator("#askCard").count() == 0, "and it stays away for the session")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
