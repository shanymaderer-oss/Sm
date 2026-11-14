"""Lines and stations on a far leg (2026-11-14, the owner asked for transit info like Moovit, free and without live times):
the metro/train/tram stops around the trip come from one Overpass query (pretend here), a far leg says which line to take
from which station to which, map data cannot inject HTML or a style, and the answer is kept for offline. Must end with FAILS: []."""
import asyncio, os, re, urllib.parse
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print("ok " if ok else "BAD", what)
    if not ok: FAILS.append(what)

def fake_overpass(query):
    """a grid of stations over the asked box, all on metro line A, plus one hostile name and colour"""
    m = re.search(r"\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)", query)
    s, w, n, e = map(float, m.groups())
    nodes, i, lat = [], 1, s
    while lat <= n:
        lng = w
        while lng <= e:
            nodes.append({"type": "node", "id": i, "lat": round(lat, 5), "lon": round(lng, 5), "tags": {"name": f"Stazione {i}", "public_transport": "stop_position", "subway": "yes"}})
            i += 1; lng += 0.006
        lat += 0.006
    nodes[0]["tags"]["name"] = '<img src=x onerror="window.PWN=1">'
    out = nodes + [{"type": "relation", "id": 900, "tags": {"type": "route", "route": "subway", "ref": "A", "colour": "#E1251B"}}]
    out += [{"type": "node", "id": x["id"]} for x in nodes]
    out += [{"type": "relation", "id": 901, "tags": {"type": "route", "route": "subway", "ref": "B", "colour": "red;background:url(//evil)"}}]
    out += [{"type": "node", "id": x["id"]} for x in nodes[:3]]
    out += [{"type": "relation", "id": 902, "tags": {"type": "route", "route": "train", "ref": "Frecciarossa 9500", "name": "Roma - Milano"}}]
    out += [{"type": "node", "id": x["id"]} for x in nodes]
    return {"elements": out}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 400, "height": 860})
        asked = []
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]}, headers={"access-control-allow-origin": "*"})
            if "interpreter" in u and route.request.method == "POST":
                q = urllib.parse.unquote_plus((route.request.post_data or "")[5:])
                if "stop_position" in q:
                    asked.append(q)
                    return await route.fulfill(json=fake_overpass(q), headers={"access-control-allow-origin": "*"})
            return await route.abort()
        await ctx.route("**/*", r)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(500)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=25000); await pg.wait_for_timeout(800)
        await pg.click("text=לפני הטיסה"); await pg.click("[data-move=transit]"); await pg.wait_for_selector(".triphero", timeout=25000); await pg.wait_for_timeout(1500)
        if not await pg.locator(".ride").count() and await pg.locator("text=המסלול").count(): await pg.click("text=המסלול >> nth=0"); await pg.wait_for_timeout(1500)
        await pg.wait_for_selector(".ride", timeout=15000)
        rides = await pg.evaluate("[...document.querySelectorAll('.ride')].map(x=>x.innerText)")
        print("rides:", rides[:3])
        check(len(rides) >= 1, f"a far leg says which line to take ({len(rides)})")
        check(any(re.search(r"מטרו: \d+ דק׳ הליכה לתחנת .+, נוסעים עד .+ · כ-\d+ דק׳", x) for x in rides), "the line, the stations and the time are written")
        check(len(asked) == 1, f"one Overpass query for the trip ({len(asked)})")
        check(await pg.evaluate("!window.PWN && !document.querySelector('.ride img')"), "a station name from the map is text, not HTML")
        styles = await pg.evaluate("[...document.querySelectorAll('.lnb')].map(x=>x.getAttribute('style')||'')")
        check(all(s == "" or re.fullmatch(r"--c:#[0-9A-Fa-f]{3,6}", s) for s in styles), f"only a plain hex colour becomes a style ({set(styles)})")
        check(not any("Frecciarossa" in x or "Milano" in x for x in rides), "long-distance trains are not offered as a city line")
        kept = await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('masa-rail:')).length")
        check(kept == 1, "the stations are kept on the phone for offline")
        # the same trip again: no second query
        await pg.reload(); await pg.wait_for_timeout(1500)
        if await pg.locator(".savedtrip").count(): await pg.click(".savedtrip >> nth=0"); await pg.wait_for_timeout(1500)
        check(len(asked) == 1, "opening the trip again does not ask Overpass again")
        # walking a short leg never offers a ride
        short = await pg.evaluate("""() => { const t = { days: [{ stops: [{ lat: 41.9, lng: 12.48 }, { lat: 41.901, lng: 12.481 }] }] };
            return Masa.transport.ride(t, t.days[0].stops[0], t.days[0].stops[1], null, 3); }""")
        check(short is None, "a 3-minute walk is not turned into a ride")
        check(not errs, f"no page errors {errs}")
        await b.close()
asyncio.run(main())
print("FAILS:", FAILS)
import sys; sys.exit(1 if FAILS else 0)
