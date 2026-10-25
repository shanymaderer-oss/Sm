"""'Now' card during the trip: shows the next stop of today, walking time from the traveler, done/skip, end of day, and nothing when not traveling."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
OUT = os.environ.get("QA_OUT", "/tmp/masa-qa/")
async def main():
  ok = []
  async with async_playwright() as p:
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={"width": 400, "height": 860}, timezone_id="Europe/Prague", geolocation={"latitude": 50.087, "longitude": 14.421}, permissions=["geolocation"])
    async def r(route):
      u = route.request.url
      if u.startswith(URL): return await route.continue_()
      if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]}, headers={"access-control-allow-origin": "*"})
      return await route.abort()
    await ctx.route("**/*", r)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.clock.install(time="2026-11-03T10:50:00+01:00")
    await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(500)
    await pg.fill("#gq", "פראג"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500)
    await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=25000); await pg.wait_for_timeout(1000)
    card = lambda: pg.evaluate("document.getElementById('nowCard')?.innerText || ''")
    async def reopen(start=None):
      if start: await pg.evaluate("s => { const L = JSON.parse(localStorage.getItem('masa-trips')); L[0].opts.start = s; L[0].done = {}; localStorage.setItem('masa-trips', JSON.stringify(L)); }", start)
      await pg.reload(); await pg.wait_for_selector(".savedtrip", timeout=10000); await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero"); await pg.wait_for_timeout(300)
    # planned for a later date: no card
    await reopen("2026-12-01")
    c0 = await card(); print("not traveling:", repr(c0)); ok.append(c0 == "")
    # today is day 1 of the trip
    await reopen("2026-11-03")
    c1 = await card(); print("day 1:", c1.replace("\n", " | ")); ok.append("עכשיו בטיול" in c1 and "התחנה" in c1)
    first = await pg.evaluate("document.querySelector('.nownext b').innerText")
    await pg.click("#nowDone"); await pg.wait_for_timeout(200)
    second = await pg.evaluate("document.querySelector('.nownext b')?.innerText || ''")
    print("after done:", first, "->", second); ok.append(second and second != first)
    await pg.click("#nowSkip"); await pg.wait_for_timeout(200)
    third = await pg.evaluate("document.querySelector('.nownext b')?.innerText || ''")
    print("after skip:", second, "->", third); ok.append(third != second)
    if await pg.query_selector("#nowWhere"):
      await pg.click("#nowWhere"); await pg.wait_for_timeout(800)
    c2 = await card(); print("with location:", c2.replace("\n", " | ")); ok.append("מכם" in c2)
    href = await pg.evaluate("document.querySelector('#nowCard a.btn')?.href || ''")
    print("nav:", href[:90]); ok.append(href.startswith("https://www.google.com/maps/dir/"))
    os.makedirs(OUT, exist_ok=True); await pg.screenshot(path=os.path.join(OUT, "now_card.png"))
    # late evening: the day is over
    await pg.clock.set_fixed_time("2026-11-03T23:40:00+01:00"); await reopen()
    c3 = await card(); print("evening:", c3.replace("\n", " | ")); ok.append("סיימתם" in c3)
    # opening the saved trip on day 2 opens day 2
    await pg.clock.set_fixed_time("2026-11-04T09:00:00+01:00"); await reopen()
    day = await pg.evaluate("[...document.querySelectorAll('.daytab')].findIndex(b => b.getAttribute('aria-selected') === 'true')"); print("open on day 2 -> selected day tab =", day); ok.append(day == 1)
    print("errors:", errs); ok.append(not errs)
    await b.close()
  print("checks:", ok)
  return all(ok)
sys.exit(0 if asyncio.run(main()) else 1)
