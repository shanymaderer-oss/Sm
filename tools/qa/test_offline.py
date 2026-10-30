"""Offline check: open the site, build a trip, go offline, reload, and open the saved trip."""
import asyncio, os
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={"width": 400, "height": 860})
    async def r(route):
      u = route.request.url
      if u.startswith(URL): return await route.continue_()
      if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]}, headers={"access-control-allow-origin": "*"})
      return await route.abort()
    await ctx.route("**/*", r)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(500)
    await pg.evaluate("navigator.serviceWorker.ready.then(()=>1)")
    await pg.reload(); await pg.wait_for_timeout(800)
    print("controlled:", await pg.evaluate("!!navigator.serviceWorker.controller"))
    await pg.fill("#gq", "פראג"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
    await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=25000); await pg.wait_for_timeout(1500)
    await ctx.set_offline(True)
    await pg.reload(); await pg.wait_for_timeout(1500)
    saved = await pg.evaluate("document.querySelectorAll('.savedtrip').length")
    print("offline reload ok, saved trips:", saved)
    await pg.click(".savedtrip >> nth=0"); await pg.wait_for_timeout(1200)
    print("offline trip:", (await pg.evaluate("document.querySelector('.triphero h1')?.innerText")), "| stops:", await pg.evaluate("document.querySelectorAll('button.stop').length"))
    await pg.fill("#gq", "וינה"); await pg.press("#gq", "Enter")
    await pg.wait_for_selector("#whenNext, #buildBtn", timeout=15000)
    steps = await pg.locator("#whenNext").count() > 0
    print("offline, the flights step opens:", steps)
    await Q.to_goals(pg)
    print("errors:", errs)
    global OK; OK = not errs and saved >= 1 and steps
    await b.close()
OK = False
asyncio.run(main())
import sys; sys.exit(0 if OK else 1)
