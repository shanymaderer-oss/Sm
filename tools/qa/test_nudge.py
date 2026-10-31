"""Asking to sign in at the moment of value (the masa-conversion skill).
After a trip is built: a small card under the trip header offers to keep it on every device. After an edit it says the
changes live only in this browser. One tap dismisses it for the session. Never for the sample trip. The trip works fully
without signing in. Tapping 'sign in' remembers the trip, so the Google redirect returns to it."""
import asyncio, os, sys
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (the emulator account mode)"); return
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
        # the account feature is on (the local emulator mode), nobody signed in
        await pg.add_init_script("try { localStorage.setItem('masa-cloud-emu', '1') } catch {}")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        check(await pg.locator("#nudge").count() == 0, "no sign-in card on the first screen")
        await pg.click("#sampleBtn"); await pg.wait_for_selector(".triphero", timeout=20000); await pg.wait_for_timeout(400)
        check(await pg.locator("#nudge").count() == 0, "no sign-in card on the sample trip")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=60000); await pg.wait_for_timeout(1500)
        txt = await pg.inner_text("#nudge") if await pg.locator("#nudge").count() else ""
        check("בכל המכשירים" in txt and "Google" in txt and "לא עכשיו" in txt, f"after the build: keep the trip on every device ({txt[:80]!r})")
        check(await pg.evaluate("document.querySelector('#nudge').compareDocumentPosition(document.querySelector('.triphero')) & Node.DOCUMENT_POSITION_PRECEDING") > 0, "the card is under the trip header, not a popup")
        # an edit: the message turns to 'your changes live only in this browser'
        await pg.click("#editDay"); await pg.wait_for_timeout(300)
        await pg.click(".editbar [data-del] >> nth=1"); await pg.wait_for_timeout(800)
        txt = await pg.inner_text("#nudge") if await pg.locator("#nudge").count() else ""
        check("רק בדפדפן הזה" in txt, f"after an edit: the changes live only in this browser ({txt[:80]!r})")
        # tapping sign in remembers the trip for the way back from Google
        tid = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].id")
        await pg.click("#nudgeIn"); await pg.wait_for_timeout(500)
        check(await pg.evaluate("sessionStorage.getItem('masa-return-trip')") == tid, "signing in remembers which trip to return to")
        await pg.evaluate("sessionStorage.removeItem('masa-return-trip')")
        # dismiss: gone, and stays away for the session
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero"); await pg.wait_for_timeout(800)
        if await pg.locator("#nudge").count():
            await pg.click("#nudgeNo"); await pg.wait_for_timeout(300)
        check(await pg.locator("#nudge").count() == 0, "'not now' removes the card")
        await pg.click(".daytab >> nth=1"); await pg.wait_for_timeout(400)
        check(await pg.locator("#nudge").count() == 0, "and it does not come back in the same session")
        # the trip works fully without an account
        await pg.click("button.stop >> nth=0"); await pg.wait_for_timeout(500)
        check(await pg.locator(".screen h1").count() > 0, "the trip works without signing in (a place opens)")
        errs = [e for e in errs if "network-request-failed" not in e]  # no emulator here: the tap tries to reach it
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
