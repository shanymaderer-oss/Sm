"""Diagnosis (not a pass/fail test): a trip to a city that is not one of our ready cities, on the live site with the real
network. Prints NOTE lines: what the city's places look like, each day (stops, start and end), the wishes, the guide's
answers, the bookings screen, and the 'already booked' search for an address. CITY and NOTES from the environment."""
import asyncio, os, json, time
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
CITY = os.environ.get("CITY", "מיאמי"); NOTES = os.environ.get("NOTES", "אוכל טוב, חוף ים, חייבים לראות את וינווד ואת ליטל האוואנה, ובערב משהו עם נוף")
ADDR = os.environ.get("ADDR", "11NE 6th st")
def note(*a): print("NOTE", *a, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 400, "height": 860}, locale="he-IL")
        await ctx.add_init_script("try { localStorage.setItem('masa-nostats', 'true') } catch {}")
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text else None)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(1500)
        await pg.fill("#gq", CITY); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(1500)
        await Q.to_goals(pg)
        await pg.fill("#notes", NOTES); await pg.wait_for_timeout(2500)
        note("wishes understood:", (await pg.inner_text("#wishOut")).replace("\n", " / ")[:300])
        t0 = time.time()
        await pg.click("#buildBtn")
        try: await pg.wait_for_selector(".triphero", timeout=120000)
        except Exception: note("NO TRIP:", (await pg.inner_text(".screen"))[:300]); await b.close(); return
        note(f"built in {time.time()-t0:.0f}s"); await pg.wait_for_timeout(8000)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        pl = t.get("places") or []
        cats = {}
        for x in pl: cats[x.get("kind")] = cats.get(x.get("kind"), 0) + 1
        note("places in the city by kind:", json.dumps(dict(sorted(cats.items(), key=lambda kv: -kv[1])[:16]), ensure_ascii=False))
        note("opts:", json.dumps({k: t["opts"].get(k) for k in ["days", "pace", "start", "interests", "move"]}, ensure_ascii=False))
        for i, d in enumerate(t["days"]):
            st = d["stops"]
            note(f"day {i+1}: {len(st)} stops, start {st[0].get('time') if st else '-'}, last {st[-1].get('time') if st else '-'} ({st[-1].get('name') if st else ''}):",
                 " | ".join(f"{s.get('time','')} {s.get('meal') or s.get('kind')}:{s['name'][:22]}" for s in st))
        note("wish result:", json.dumps(t.get("wish"), ensure_ascii=False)[:400])
        # the guide
        await pg.click("#nav button[data-k=guide]"); await pg.wait_for_selector("#askInput")
        for q in ["תן לי מסעדות טובות במיאמי", "איפה לאכול כאן קרוב?", "מה כדאי לעשות בערב?"]:
            n = await pg.locator(".msg.bot").count()
            await pg.fill("#askInput", q); await pg.press("#askInput", "Enter")
            for _ in range(40):
                await pg.wait_for_timeout(500)
                if await pg.locator(".msg.bot").count() > n: break
            await pg.wait_for_timeout(2500)
            note(f"guide '{q}':", (await pg.locator(".msg.bot").last.inner_text()).replace("\n", " ")[:220])
        # bookings
        e0 = len(errs)
        await pg.click("#nav button[data-k=book]"); await pg.wait_for_timeout(2500)
        note("bookings screen:", (await pg.inner_text(".screen")).replace("\n", " / ")[:300], "| errors:", errs[e0:][:3])
        # the 'already booked' search on the hotels list
        await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(800)
        has = await pg.evaluate("!!document.querySelector('#myHotelIn')")
        if not has:
            for sel in ["[data-chip=hotel]", "button:has-text('מלונות')"]:
                if await pg.locator(sel).count(): await pg.locator(sel).first.click(); await pg.wait_for_timeout(2000); break
        if await pg.locator("#myHotelIn").count():
            await pg.fill("#myHotelIn", ADDR); await pg.press("#myHotelIn", "Enter"); await pg.wait_for_timeout(9000)
            note(f"'already booked' search for '{ADDR}':", (await pg.inner_text(".myhotel")).replace("\n", " / ")[:300])
        else: note("could not reach the 'already booked' card")
        note("page errors:", errs[:6])
        await b.close()
asyncio.run(main())
