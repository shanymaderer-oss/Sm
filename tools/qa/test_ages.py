"""Who is traveling (2026-11-25, the owner asked: "שהטיול יהיה אופציה לגילאים ואז משם זה לוקח את הרעיונות"). On the
wishes screen the traveler picks the ages (babies, kids, teens and young, adults, 60+; adults with 60+ together walk less but keep the pace); the trip is built for them (read
like the same words in the wishes box) and the agent is told the ages, so every later suggestion fits them."""
import asyncio, os, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(500)
        teens = await pg.evaluate("(() => { const w = Masa.intent.parse('אנחנו זוג עם נוער'); return { teens: !!w.teens, fam: (w.add || []).includes('family') || JSON.stringify(w).includes('family') }; })()")
        check(teens["teens"], f"the wishes reader knows teens ({teens})")
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        chips = await pg.locator("#ages button").all_inner_texts()
        check(len(chips) == 5 and "ילדים" in chips[1] and "נוער וצעירים" in chips[2] and "גיל הזהב" in chips[4], f"five age chips on the wishes screen ({chips})")
        await pg.click("#ages button[data-v=kids]"); await pg.click("#ages button[data-v=adults]")
        check(await pg.get_attribute("#ages button[data-v=kids]", "aria-pressed") == "true", "a chip turns on")
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        check(t["opts"].get("ages") == ["kids", "adults"], f"the trip keeps the ages ({t['opts'].get('ages')})")
        kinds = [s.get("kind") for d in t["days"] for s in d["stops"]]
        check(not any(k in ("bar", "club") for k in kinds), f"with kids: no bars or clubs ({sorted(set(k for k in kinds if k))})")
        # the same city with the ages read by the planner directly: kids lift parks and zoos
        lab = await pg.evaluate("""(async () => { const t = await Masa.planner.build({query:'רומא', days:2, interests:['history','view','food'], budget:'בינוני', pace:'מאוזן', notes:'', ages:['senior']}, ()=>{}, null); return t.opts.ages; })()""")
        check(lab == ["senior"], f"the planner takes ages directly ({lab})")
        # 60+ alone: calmer days; 60+ with younger adults: less walking but the same pace
        n = await pg.evaluate("""(async () => { const go = a => Masa.planner.build({query:'רומא', days:2, interests:['history','view','food'], budget:'בינוני', pace:'מאוזן', notes:'', ages:a}, ()=>{}, null);
          const s = await go(['senior']), m = await go(['adults','senior']);
          return { s: s.wish?.labels || [], m: m.wish?.labels || [] }; })()""")
        check(any("קצב רגוע" in x for x in n["s"]), f"60+ alone: a calm pace ({n['s']})")
        check(any("פחות הליכה" in x for x in n["m"]) and not any("קצב רגוע" in x for x in n["m"]), f"adults with 60+: less walking, same pace ({n['m']})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
