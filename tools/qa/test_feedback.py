"""'Something did not work?' sends a note; anonymous counts carry only the event, the city and a number, and the switch
in settings turns them off. Firestore is mocked: we check exactly what would be sent."""
import asyncio, os, sys, json
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
        await ctx.add_init_script("window.MASA_STATS_TEST = true")
        pg = await ctx.new_page()
        errs, sent = [], []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "firestore.googleapis.com" in u and ":commit" in u:
                sent.append(json.loads(route.request.post_data)); return await route.fulfill(json={"writeResults": [{}]})
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(400)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(600)
        ev = [w for x in sent for w in x["writes"] if "/events/" in w["update"]["name"]]
        check(len(ev) == 1, f"building a trip is counted once ({len(ev)})")
        if ev:
            f = ev[0]["update"]["fields"]
            check(set(f) <= {"e", "city", "n"} and f["e"]["stringValue"] == "build" and f["city"]["stringValue"] == "rome" and f["n"]["integerValue"] == "3", f"the count has only the event, city and days: {f}")
            check(ev[0]["updateTransforms"][0]["fieldPath"] == "at" and ev[0]["currentDocument"] == {"exists": False}, "the time is set by the server and a count can only be created")
        # feedback from the home screen link
        await pg.click("#nav button[data-k=home]"); await pg.wait_for_selector("#homeFb")
        await pg.click("#homeFb"); await pg.wait_for_selector("#fbText")
        check(await pg.evaluate("document.activeElement.id") == "fbText", "the link opens the feedback box, ready to type")
        await pg.click("#fbSend"); await pg.wait_for_timeout(200)
        check("כמה מילים" in await pg.inner_text("#fbStatus"), "an empty note is not sent")
        n0 = len(sent)
        await pg.fill("#fbText", "בבנייה של טיול לפראג המסך נתקע"); await pg.fill("#fbContact", "a@b.co")
        await pg.click("#fbSend"); await pg.wait_for_timeout(600)
        fb = [w for x in sent[n0:] for w in x["writes"] if "/feedback/" in w["update"]["name"]]
        check(len(fb) == 1 and fb[0]["update"]["fields"]["text"]["stringValue"].startswith("בבנייה") and fb[0]["update"]["fields"]["contact"]["stringValue"] == "a@b.co", "the note is sent with the contact")
        check("תודה" in await pg.inner_text("#fbStatus"), "the sender is thanked")
        # counts off
        await pg.uncheck("#statsOn"); n1 = len(sent)
        await pg.click("#backPrev"); await pg.wait_for_timeout(300)
        await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero")
        await pg.click("#nav button[data-k=book]"); await pg.wait_for_timeout(500)
        check(len(sent) == n1, "with counts off, nothing is sent")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
