"""A trip is built into the traveler's Google account: signed out, 'build' opens one sign-in step (with privacy and terms
links, a way back and the sample trip), and what they chose is kept for the way back from Google. The sample stays open
without an account. The full sign-in and build is covered by test_cloud.py (with the emulators)."""
import asyncio, os, sys, json
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
        await pg.add_init_script("try { localStorage.setItem('masa-cloud-emu', '1'); localStorage.setItem('masa-gate', '1') } catch {}")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.click("#sampleBtn"); await pg.wait_for_selector(".triphero", timeout=20000)
        check(True, "the sample trip opens without an account")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click(".tile >> nth=0")
        await pg.fill("#notes", "חייבים לראות את הקולוסיאום")
        await pg.click("#buildBtn"); await pg.wait_for_timeout(800)
        check(await pg.locator("#gateIn").count() == 1, "signed out: 'build' opens the sign-in step")
        txt = await pg.inner_text(".gatecard") if await pg.locator(".gatecard").count() else ""
        check("Google" in txt and "רומא" in txt, f"it says the trip to Rome is kept in the Google account ({txt[:70]!r})")
        check(await pg.locator(".gatecard a[href='privacy.html']").count() == 1 and await pg.locator(".gatecard a[href='terms.html']").count() == 1, "privacy and terms links")
        check(await pg.locator(".triphero").count() == 0 and await pg.evaluate("!localStorage.getItem('masa-trips') || JSON.parse(localStorage.getItem('masa-trips')).length === 0"), "no trip is built before signing in")
        check(await pg.evaluate("document.activeElement && document.activeElement.id") == "gateIn", "the sign-in button has the focus")
        # back: the form, as they left it
        await pg.click("#backGate"); await pg.wait_for_timeout(400)
        check(await pg.locator("#buildBtn").count() == 1 and await pg.input_value("#notes") == "חייבים לראות את הקולוסיאום", "back returns to the form as they left it")
        # sign in: the choices are kept for the way back from Google (no emulator here, so it stops there)
        await pg.click("#buildBtn"); await pg.wait_for_selector("#gateIn")
        await pg.click("#gateIn"); await pg.wait_for_timeout(600)
        saved = json.loads(await pg.evaluate("sessionStorage.getItem('masa-pending-build') || 'null'") or "null")
        check(bool(saved) and "רומא" in saved["dest"]["q"] and saved["form"]["notes"] == "חייבים לראות את הקולוסיאום" and isinstance(saved["form"]["touched"], list), "the destination and every choice are kept for the way back")
        # the quick build ('skip, build me a trip now') goes through the same step
        await pg.evaluate("sessionStorage.removeItem('masa-pending-build')")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "פריז"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(600)
        if await pg.locator("#quickBuild").count():
            await pg.click("#quickBuild"); await pg.wait_for_timeout(800)
            check(await pg.locator("#gateIn").count() == 1, "the quick build asks to sign in too")
        await pg.click("#gateSample"); await pg.wait_for_selector(".triphero", timeout=20000)
        check(True, "from the sign-in step, the sample trip opens")
        errs = [e for e in errs if "network-request-failed" not in e]
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
