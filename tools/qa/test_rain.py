"""Rain in the forecast: a trip that starts in two days, with a (pretend) forecast of rain. The day shows the forecast and offers
to swap the stops that are outside for indoor places close to them; after the swap the tip is gone and there are fewer outdoor stops.
A dry forecast shows nothing. Runs against the local server only; the forecast is answered here, never fetched."""
import asyncio, os, sys, json, datetime
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

def forecast(rain):
    d0 = datetime.date.today()
    days = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range(16)]
    return {"daily": {"time": days, "temperature_2m_max": [14] * 16, "temperature_2m_min": [8] * 16,
                      "precipitation_probability_max": [rain] * 16, "weather_code": [63 if rain > 50 else 1] * 16}}

async def run(b, rain):
    ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
    async def r(route):
        u = route.request.url
        if u.startswith(URL): return await route.continue_()
        if "api.open-meteo.com" in u: return await route.fulfill(json=forecast(rain), headers={"access-control-allow-origin": "*"})
        if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
        return await route.abort()
    await ctx.route("**/*", r)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
    start = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
    await pg.fill("#gq", "פריז"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500)
    await pg.fill("#startDate", start); await pg.dispatch_event("#startDate", "change")
    await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(1500)
    outdoor = "i => JSON.parse(localStorage.getItem('masa-trips'))[0].days[i].stops.filter(s => !s.meal && ['park','view','beach','street','square','bridge'].includes(s.kind)).length"
    tip = await pg.evaluate("document.querySelector('.rainbox')?.innerText || ''")
    if rain < 50:
        check(not tip, f"dry forecast: no rain tip ({tip!r})")
    else:
        check("גשם" in tip and "80%" in tip, f"rainy forecast: the day shows it ({tip!r})")
        # the first day with stops outside offers the swap
        day = None
        for i in range(await pg.locator(".daytab").count()):
            await pg.click(f".daytab[data-i='{i}']"); await pg.wait_for_timeout(400)
            if await pg.locator("#rainSwap").count(): day = i; break
        check(day is not None, "a day with stops outside offers to swap them")
        if day is not None:
            before = await pg.evaluate(outdoor, day)
            await pg.locator(".rainbox").scroll_into_view_if_needed(); await pg.screenshot(path=os.environ.get("QA_OUT", "/tmp/masa-qa/") + "rain_offer.png")
            await pg.click("#rainSwap"); await pg.wait_for_timeout(800)
            after = await pg.evaluate(outdoor, day)
            check(after < before, f"after the swap fewer stops outside on day {day + 1} ({before} -> {after})")
            check(not await pg.locator("#rainSwap").count(), "the swap is not offered again")
            await pg.screenshot(path=os.environ.get("QA_OUT", "/tmp/masa-qa/") + "rain.png")
    check(not errs, f"no page errors {errs}")
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 80)
        await run(b, 10)
        await b.close()
asyncio.run(main())
print("FAILS:", FAILS)
sys.exit(1 if FAILS else 0)
