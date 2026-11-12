"""Opening hours in the order of a day (2026-11-12): a sight that would be closed when the walk reaches it moves earlier.
Uses planner.optimizeDay on small made-up days, no network. Must end with FAILS: []."""
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print("ok " if ok else "BAD", what)
    if not ok: FAILS.append(what)

DAY = """([hours, min, kind, dow]) => {
  const st = (name, x, k, h, m) => ({ name, kind: k, cat: "history", lat: 41.9 + x / 111, lng: 12.5, _min: m, hours: h });
  // the hotel is at one end of a line; the sight with hours is at the far end, so walking order alone would put it last
  const day = { move: "walk", startMin: 540, dow: dow == null ? 2 : dow, stops: [
    { name: "hotel", meal: "hotel", kind: "hotel", lat: 41.9, lng: 12.5, _min: 0, hours: null },
    { ...st("lunch", 0.45, "restaurant", null, 60), meal: "lunch", cat: "food" }, { ...st("treat", 0.45, "cafe", null, 30), meal: "treat", cat: "food" },
    st("park 1", 0.3, "park", null, min), st("park 2", 0.6, "park", null, min), st("sight", 0.9, kind, hours, 60)] };
  Masa.planner.optimizeDay(day);
  return day.stops.filter(s => !s.meal).map(s => s.name + "@" + s.time);  // the sights in the order of the day, with their times
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            return await (route.continue_() if route.request.url.startswith(URL) else route.abort())
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_function("window.Masa&&Masa.planner")
        first = lambda o: o[0].startswith("sight")
        o = await pg.evaluate(DAY, ["Mo-Su 09:00-11:30", 60, "museum"])
        check(first(o), f"closes 11:30, so the two parks first would be too late: the sight goes first ({o})")
        o = await pg.evaluate(DAY, ["Mo-Su 09:00-18:00", 60, "museum"])
        check(not first(o), f"open all day: the shortest walk stays ({o})")
        o = await pg.evaluate(DAY, ["Mar 29-Sep 30 08:30-19:15; Oct 25-Feb 28 08:30-11:30; Jan 01 off", 60, "sight"])
        check(first(o), f"seasonal hours: the earliest closing of the year counts ({o})")
        o = await pg.evaluate(DAY, [None, 250, "museum"])
        sight = next(x for x in o if x.startswith("sight")).split("@")[1]
        check(sight <= "16:00", f"a museum with no hours is reached by 16:00 ({o})")
        o = await pg.evaluate(DAY, ["Mo 09:00-11:30; Tu-Su 09:00-18:00", 60, "museum", 2])
        check(not first(o), f"Wednesday is open until 18:00, nothing to move ({o})")
        o = await pg.evaluate(DAY, ["Mo 09:00-11:30; Tu-Su 09:00-18:00", 60, "museum", 0])
        check(first(o), f"Monday it closes at 11:30: the sight goes first ({o})")
        check(not errs, f"no page errors ({errs})")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
