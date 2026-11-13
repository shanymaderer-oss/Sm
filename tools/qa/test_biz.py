"""A work trip (2026-11-13, by the owner's choice after building one for a business traveller): when the wishes say
"פגישות" or "טיסת עבודה", every day is breakfast in the morning, then from 18:00 one or two places that are good after
dark, dinner (and a drink). No museum, no lunch, nothing between breakfast and 18:00. Must end with FAILS: []."""
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print("ok " if ok else "BAD", what)
    if not ok: FAILS.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 400, "height": 860})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_function("window.Masa&&Masa.planner&&Masa.intent")
        check(await pg.evaluate("Masa.intent.parse('טס לניו יורק לפגישות').biz === true"), "the wish 'לפגישות' is a work trip")
        check(await pg.evaluate("Masa.intent.parse('business trip').biz === true"), "'business trip' is a work trip")
        check(await pg.evaluate("!Masa.intent.parse('אוהבים מוזיאונים').biz"), "an ordinary wish is not a work trip")
        build = """async ([q, notes]) => { const t = await Masa.planner.build({ query: q, days: 3, interests: ["history", "food", "night", "art"], budget: "בינוני", pace: "מאוזן", diet: "הכול", move: "walk", notes, start: "2026-12-07", people: 1 }, () => {}, null);
          return t.days.map(d => ({ theme: d.theme, stops: d.stops.map(s => ({ name: s.name, meal: s.meal || null, kind: s.kind, time: s.time, min: s._min })) })); }"""
        for city in ["ניו יורק", "לונדון"]:
            days = await pg.evaluate(build, [city, "טיסת עבודה, פגישות באמצע היום"])
            check(len(days) == 3, f"{city}: three days ({len(days)})")
            for i, d in enumerate(days):
                st = d["stops"]
                names = [f"{s['time']} {s['name']}" for s in st]
                check(st and st[0]["meal"] in ("breakfast", "hotel"), f"{city} day {i+1}: starts with breakfast ({names[:2]})")
                check(any(s["meal"] == "breakfast" for s in st), f"{city} day {i+1}: has breakfast")
                check(any(s["meal"] == "dinner" for s in st), f"{city} day {i+1}: has dinner")
                check(not any(s["meal"] in ("lunch", "treat") for s in st), f"{city} day {i+1}: no lunch or sweet break")
                check(not any(s["kind"] in ("museum", "gallery", "zoo", "themepark") for s in st), f"{city} day {i+1}: no museum ({names})")
                mid = [s for s in st if s["meal"] not in ("breakfast", "hotel")]
                to_min = lambda t: int(t.split(":")[0]) * 60 + int(t.split(":")[1]) if t else 0
                check(all(to_min(s["time"]) >= 18 * 60 or to_min(s["time"]) < 5 * 60 for s in mid), f"{city} day {i+1}: everything after breakfast is from 18:00 ({names})")
                check(1 <= sum(1 for s in st if not s["meal"]) <= 2, f"{city} day {i+1}: one or two evening places ({names})")
                d_ = next((s for s in st if s["meal"] == "dinner"), None)
                check(d_ and d_["min"] >= 120, f"{city} day {i+1}: a long dinner ({d_ and d_['min']})")
        # an ordinary trip keeps lunch and its museums
        days = await pg.evaluate(build, ["לונדון", ""])
        check(any(s["meal"] == "lunch" for d in days for s in d["stops"]), "an ordinary trip still has lunch")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)

asyncio.run(main())
