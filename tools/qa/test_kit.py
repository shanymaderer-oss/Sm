"""The trip kit ('everything a trip needs'): each item links to the sites already filled with the city, dates and travelers;
marking an item closed is kept; a partner id from settings is added to that site's links only, and a bad one is ignored."""
import asyncio, os, sys, re
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
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(400)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(600)
        start = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].opts.start")
        await pg.click("#nav button[data-k=book]"); await pg.wait_for_selector(".kit")
        titles = await pg.evaluate("[...document.querySelectorAll('.kithead b')].map(b => b.innerText)")
        check(len(titles) >= 8, f"the kit lists what a trip needs ({titles})")
        for need in ["טיסות", "לינה", "ביטוח", "מהשדה", "eSIM", "סיורים", "כניסה"]:
            check(any(need in t for t in titles), f"kit has '{need}'")
        links = await pg.evaluate("[...document.querySelectorAll('.kit a.chipbtn')].map(a => a.href)")
        ours = await pg.evaluate("[...document.querySelectorAll('.kit')].filter(k => !k.querySelector('[data-kit=tables]')).flatMap(k => [...k.querySelectorAll('a.chipbtn')].map(a => a.href))")
        bad = [l for l in ours if not l.startswith("https://")]; check(not bad, f"every link we build is https (a restaurant's own site may be http) ({bad[:2]})")
        sky = [l for l in links if "skyscanner" in l]
        yy = start[2:4] + start[5:7] + start[8:10]
        check(sky and "/tlv/fco/" in sky[0] and yy in sky[0], f"flights are filled with the airport and dates ({sky[:1]})")
        bk = [l for l in links if "booking.com" in l]
        check(bk and f"checkin={start}" in bk[0], "lodging search has the dates")
        check(any("getyourguide" in l and "Rome" in l for l in links), "tours are searched in the trip's city")
        check(not any("aid=" in l for l in links) and not await pg.locator("text=חלק מהקישורים הם של שותפים").count(), "no partner ids and no partner notice while there are no partners")
        # mark closed, kept after reload
        await pg.click("[data-kit=insurance]"); await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_timeout(1000)
        await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero"); await pg.click("#nav button[data-k=book]"); await pg.wait_for_selector(".kit")
        check(await pg.is_checked("[data-kit=insurance]"), "a closed item stays closed")
        check(await pg.evaluate("document.querySelector('[data-kit=insurance]').closest('.kit').classList.contains('done')"), "a closed item is folded")
        # partners: one line of settings adds our id to that site only; a bad value is ignored
        await pg.evaluate("""window.MASA_PARTNERS = { "booking.com": { aid: "1234567" }, "getyourguide.com": { partner_id: "bad\\"><x" } }""")
        await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(300); await pg.click("#nav button[data-k=book]"); await pg.wait_for_selector(".kit")
        links = await pg.evaluate("[...document.querySelectorAll('.kit a.chipbtn')].map(a => a.href)")
        check(all("aid=1234567" in l for l in links if "booking.com" in l) and any("booking.com" in l for l in links), "the partner id is on every Booking link")
        check(not any("aid=" in l for l in links if "booking.com" not in l), "and only on Booking links")
        check(not any("partner_id" in l for l in links), "a bad partner value is ignored")
        check(await pg.locator("text=חלק מהקישורים הם של שותפים").count() > 0, "with partners, the notice is shown")
        await pg.evaluate("window.MASA_PARTNERS = null")
        await pg.screenshot(path=os.environ.get("QA_OUT", "/tmp/masa-qa/") + "kit.png", full_page=False)
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
