"""A visit is counted once per browser session, with where it came from (utm_source, the referring site, or direct),
and a trip is built without signing in (the sign-in step is off unless masa-gate=1)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; sent = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "firestore.googleapis.com" in u and "commit" in u:
                try: sent.append(json.loads(route.request.post_data or "{}"))
                except Exception: pass
                return await route.fulfill(json={})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.add_init_script("window.MASA_STATS_TEST = true")
        def visits():
            out = []
            for body in sent:
                for w in body.get("writes", []):
                    f = w.get("update", {}).get("fields", {})
                    if f.get("e", {}).get("stringValue") == "visit": out.append(f.get("city", {}).get("stringValue"))
            return out
        await pg.goto(URL + "/index.html?utm_source=facebook"); await pg.wait_for_timeout(1500)
        check(visits() == ["facebook"], f"a visit from a post link is counted with its source ({visits()})")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(1200)
        check(len(visits()) == 1, "a second page load in the same session is not counted again")
        pg2 = await ctx.new_page(); await pg2.route("**/*", r); await pg2.add_init_script("window.MASA_STATS_TEST = true")
        await pg2.goto(URL + "/index.html"); await pg2.wait_for_timeout(1200)
        check(visits()[-1:] == ["direct"] and len(visits()) == 2, f"a new tab with no referrer counts as direct ({visits()})")
        # signed out, a trip is built straight away, and the 'keep your trip' card is under it
        await pg2.fill("#gq", "רומא"); await pg2.press("#gq", "Enter"); await pg2.wait_for_timeout(600)
        if await pg2.locator("#quickBuild").count(): await pg2.click("#quickBuild")
        else:
            import flow as Q
            await Q.to_goals(pg2); await pg2.click("#buildBtn")
        await pg2.wait_for_selector(".triphero", timeout=30000)
        check(await pg2.locator("#gateIn").count() == 0, "no sign-in step before the first trip")
        errs2 = [e for e in errs if "network-request-failed" not in e]
        check(not errs2, f"no page errors {errs2[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
