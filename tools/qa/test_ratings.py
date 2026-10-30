"""Restaurant ratings with a pretend Tripadvisor (the real one needs the key): the restaurants first chosen for lunch
and dinner are rated 4.0, all others 4.7 -> every lunch and dinner is replaced by a 4.5+ restaurant from our own list,
the rating shows with Tripadvisor's image, and no rating is stored in the browser (Tripadvisor allows storing only ids)."""
import asyncio, os, sys, json, math
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
def km(a, b):
    r = math.pi / 180; dl = (b[0] - a[0]) * r; dg = (b[1] - a[1]) * r
    h = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dg / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        await ctx.add_init_script("localStorage.setItem('masa-ta-test','1')")
        pg = await ctx.new_page()
        errs = []; calls = {"n": 0}
        pg.on("pageerror", lambda e: errs.append(str(e)))
        state = {"places": None, "first": None}
        async def ta(route):
            calls["n"] += 1
            u = urlparse(route.request.url); q = parse_qs(u.query)
            if state["places"] is None:
                t = json.loads(await pg.evaluate("localStorage.getItem('masa-trips')"))[0]
                state["places"] = [x for x in t["places"] if x["kind"] == "restaurant"]
                state["first"] = {s["name"] for d in t["days"] for s in d["stops"] if s.get("meal") in ("lunch", "dinner")}
            P = state["places"]
            if u.path.endswith("/location/nearby_search"):
                lat, lng = map(float, q["latLong"][0].split(","))
                near = sorted(P, key=lambda x: km((lat, lng), (x["lat"], x["lng"])))[:10]
                return await route.fulfill(json={"data": [{"location_id": str(P.index(x)), "name": x["local"], "distance": f"{km((lat, lng), (x['lat'], x['lng'])):.3f}"} for x in near]})
            i = int(u.path.split("/")[-2]); x = P[i]
            bad = x["name"] in state["first"]
            return await route.fulfill(json={"location_id": str(i), "name": x["local"], "rating": "4.0" if bad else "4.7", "num_reviews": "250", "web_url": f"https://www.tripadvisor.com/Restaurant_Review-{i}",
                                             "rating_image_url": "", "latitude": str(x["lat"]), "longitude": str(x["lng"])})
        async def r(route):
            u = route.request.url
            if "/__ta/" in u: return await ta(route)
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(400); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=30000)
        await pg.wait_for_timeout(6000)
        t = json.loads(await pg.evaluate("localStorage.getItem('masa-trips')"))[0]
        meals = [s for d in t["days"] for s in d["stops"] if s.get("meal") in ("lunch", "dinner")]
        still_first = [s["name"] for s in meals if s["name"] in (state["first"] or set())]
        check(state["first"] is not None, "Tripadvisor was asked")
        check(len(still_first) == 0, f"every lunch and dinner was replaced by a 4.5+ restaurant (left: {still_first})")
        check(all(any(x["id"] == s.get("osm") for x in t["places"]) for s in meals), "the new restaurants come from our own list (our names and positions)")
        stored = await pg.evaluate("JSON.stringify(localStorage)")
        leak = [k for k in ['\\"rating\\":', "Restaurant_Review-", '\\"num_reviews'] if k in stored]
        check(not leak, f"no Tripadvisor rating is stored in the browser {leak}")
        badges = await pg.evaluate("document.querySelectorAll('.tabadge').length")
        check(badges >= 2, f"ratings show on the day's meals ({badges})")
        check(calls["n"] <= 31, f"calls stay within the per-trip budget ({calls['n']})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
