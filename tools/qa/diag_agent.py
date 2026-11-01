"""Diagnosis on the live site with the real smart guide: build a trip, ask the agent a few changes in Hebrew, print what
it said, what changed and its new suggestions. Not a pass/fail test (the guide's words differ every time)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
CITY = os.environ.get("CITY") or "פריז"
ASKS = ["יום 2 רגוע יותר, פחות הליכה", "בלי מוזיאונים בכלל", "תוסיף שוק אוכל ומקום יפה לשקיעה", "תעביר את המגדל לסוף היום האחרון"]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 400, "height": 860}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        raw = []
        async def onresp(r):
            if r.url.endswith("/generate"):
                try:
                    body = r.request.post_data or ""
                    if "trip planner inside" in body: raw.append(f"{r.status} {(await r.text())[:900]}")
                except Exception as e: raw.append(f"? {e}")
        pg.on("response", lambda r: asyncio.ensure_future(onresp(r)))
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(1500)
        await pg.fill("#gq", CITY); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(800); await Q.to_goals(pg)
        await pg.fill("#notes", "זוג, אוהבים אוכל טוב ואומנות, בערב משהו עם נוף"); await pg.wait_for_timeout(5000)
        print("HINTS:", await pg.locator("#wishHints button").all_inner_texts())
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=90000); await pg.wait_for_selector("#agent", timeout=15000)
        try: await pg.wait_for_function("!JSON.parse(localStorage.getItem('masa-trips'))[0].pending", timeout=60000)
        except Exception: pass
        names = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].days.map(d => d.stops.map(s => s.name))")
        print("START CHIPS:", await pg.locator("#agent [data-ach]").all_inner_texts())
        before = await names(); print("TRIP:", json.dumps(before, ensure_ascii=False))
        for q in ASKS:
            t0 = asyncio.get_event_loop().time()
            await pg.fill("#agentIn", q); await pg.press("#agentIn", "Enter")
            n0 = len(raw)
            try:
                await pg.wait_for_function(f"true", timeout=1000)
                for _ in range(80):
                    if len(raw) > n0 and not await pg.locator("#agent .agentsay.busy").count(): break
                    await pg.wait_for_timeout(500)
            except Exception: pass
            await pg.wait_for_timeout(800)
            after = await names()
            gone = [n for d in before for n in d if n not in sum(after, [])]; new = [n for d in after for n in d if n not in sum(before, [])]
            moved = [n for i, d in enumerate(after) for n in d if any(n in bd for j, bd in enumerate(before) if j != i) and n not in before[i]]
            say = await pg.inner_text("#agent .agentsay") if await pg.locator("#agent .agentsay").count() else ""
            print(f"\nASK: {q}  ({asyncio.get_event_loop().time() - t0:.1f}s)\nSAY: {say.strip()[:300]}\nREMOVED: {gone}\nADDED: {new}\nMOVED: {moved}\nCHIPS: {await pg.locator('#agent [data-ach]').all_inner_texts()}")
            print("RAW:", raw[n0:] if len(raw) > n0 else "none")
            before = after
        print("\nERRORS:", errs[:3])
        await b.close()
asyncio.run(main())
