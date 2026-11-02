"""'The map for the flight': the street map's tiles around the trip and its letters go into the offline cache, and are
there with no internet. The map server is simulated (any tile answers), the offline cache is the real one (sw.js)."""
import asyncio, os, sys, json
os.environ.setdefault("PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS", "1")  # the offline cache's own requests go through the simulated map server too
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
STYLE = {"version": 8, "glyphs": "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
         "sources": {"openmaptiles": {"type": "vector", "tiles": ["https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf"], "maxzoom": 14}},
         "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}},
                    {"id": "lbl", "type": "symbol", "source": "openmaptiles", "source-layer": "place", "layout": {"text-field": "x", "text-font": ["Noto Sans Regular"]}}]}
async def main():
    if "localhost" not in URL: print("SKIP: runs on a local copy (the map server is simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860})
        asked = []
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json=STYLE, headers={"access-control-allow-origin": "*"})
            if "tiles.openfreemap.org/planet/test" in u or "tiles.openfreemap.org/fonts" in u:
                asked.append(u); return await route.fulfill(body=b"\x00", headers={"access-control-allow-origin": "*", "content-type": "application/x-protobuf"})
            return await route.abort()
        await ctx.route("**/*", r)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(500)
        await pg.evaluate("navigator.serviceWorker.ready.then(() => 1)"); await pg.reload(); await pg.wait_for_timeout(1000)
        await pg.fill("#gq", "פראג"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_timeout(800)
        await pg.click("[data-folder=before]"); await pg.wait_for_selector("#mapCard")
        check("לשמור את מפת העיר" in await pg.inner_text("#mapCard"), "'the map for the flight' is offered in 'before the flight'")
        await pg.click("#mapCard")
        for _ in range(60):
            if await pg.locator("#mapCard").count() and "שמורה בטלפון" in await pg.inner_text("#mapCard"): break
            await pg.wait_for_timeout(500)
        n = await pg.evaluate("caches.open('masa-tiles-v1').then(c => c.keys()).then(k => k.filter(r => r.url.includes('/planet/test/') || r.url.includes('/fonts/')).length)")
        zs = sorted({int(u.split('/planet/test/')[1].split('/')[0]) for u in asked if '/planet/test/' in u})
        check(n >= 20 and zs[0] <= 10 and zs[-1] == 14, f"the tiles around the trip (zoom {zs[0]}-{zs[-1]}) and the letters are in the offline cache ({n})")
        check(any("1280-1535" in u for u in asked), "the Hebrew letters of the map are saved too")
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].mapSaved")
        check(bool(t), "the trip remembers that its map is saved")
        # no internet: a saved tile still comes
        tile = next(u for u in asked if "/planet/test/14/" in u)
        await ctx.set_offline(True)
        ok = await pg.evaluate(f"fetch({json.dumps(tile)}, {{ mode: 'cors' }}).then(r => r.ok).catch(() => false)")
        check(ok, "offline, a saved tile is served from the phone")
        await ctx.set_offline(False)
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
