"""The assistant finds a free walking tour or a place with free entry and puts it in the day at its hour (2026-11-26, the
owner's wish: "סיורים חינמיים וכניסה חינם עם שעה"). A button opens the registration (no credit card; the traveler does
it), the agent then asks whether it is closed, and it never says it registered anyone. Without the smart guide the device
does the tour by itself. The smart guide is simulated."""
import asyncio, os, json, re
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (the guide is simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; mode = {"m": "tour"}; seen = {}; opened = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}"); txt = json.dumps(body, ensure_ascii=False)
                if "trip planner inside" not in txt: return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                prm = body["contents"][-1]["parts"][0]["text"]; seen["prm"] = prm; seen["sys"] = txt
                if mode["m"] == "tour":
                    j = {"say": "רשמתי אתכם לסיור הליכה חינמי ביום 2 ב-10:00.", "actions": [{"do": "tour", "day": 2, "time": "10:00", "minutes": 150}], "chips": []}
                else:
                    m = re.search(r"^p(\d+) (.+?) \[(?!restaurant|cafe|bar|bakery|dessert|market|deli|club)[a-z_]+:[^\]]*free", prm, re.M)
                    seen["free"] = m.group(2).strip() if m else None
                    j = {"say": f"הכנסתי את {seen['free']} ליום 3 ב-11:00, הכניסה חינם.", "actions": [{"do": "appt", "day": 3, "time": "11:00", "minutes": 90, "title": seen["free"] or "x", "place": f"p{m.group(1) if m else 999}"}], "chips": []}
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps(j, ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        await pg.goto(URL + "/index.html"); await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_selector("#agent", timeout=8000)
        await pg.evaluate("window.open = (u) => { (window.__opened = window.__opened || []).push(String(u)); return null; }")
        await pg.locator("#nav button", has_text="הסוכן").first.click(); await pg.wait_for_selector("#askInput", timeout=8000)
        # 1. a free walking tour, with the smart guide
        await pg.fill("#askInput", "תמצא לנו סיור הליכה חינם ביום 2"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(2500)
        check('"do":"tour"' in seen.get("sys", "").replace(" ", "") or "free walking tour" in seen.get("sys", ""), "the agent knows how to put a free tour in the day")
        d2 = (await trip())["days"][1]["stops"]
        tour = [s for s in d2 if s.get("tour")]
        check(len(tour) == 1 and tour[0]["time"] == "10:00" and tour[0].get("at") == 600, f"the tour is in day 2 at 10:00 ({[(s.get('time'), s['name']) for s in d2]})")
        check(tour and "בדף ההרשמה" in tour[0].get("tip", ""), "the meeting point is honestly on the registration page")
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("רשמתי" not in last and "לוחצים על הכפתור" in last, f"it never says it registered them ({last[:90]!r})")
        btns = pg.locator("#log .msg.bot:last-child [data-gact]")
        texts = await btns.all_inner_texts()
        check(any("להירשם לסיור" in x and "בלי כרטיס" in x for x in texts), f"a button to register, no card ({texts})")
        await btns.filter(has_text="להירשם לסיור").first.click(); await pg.wait_for_timeout(1800)
        op = await pg.evaluate("window.__opened || []")
        check(any("free%20walking%20tour" in u or "free+walking+tour" in u for u in op), f"it opens the registration search ({op[-1:]})")
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("נסגר" in last, f"then it asks whether it is closed ({last[:60]!r})")
        await pg.locator("#log .msg.bot:last-child [data-gact]", has_text="כן, נסגר").first.click(); await pg.wait_for_timeout(500)
        check(any(s.get("tour") and s.get("booked") for s in (await trip())["days"][1]["stops"]), "yes: the tour gets ✓")
        # 2. free entry at a time
        mode["m"] = "free"
        await pg.fill("#askInput", "מקום עם כניסה חינם ביום 3 ב-11"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(2500)
        check(seen.get("free"), f"places with free entry are marked free for the agent ({seen.get('free')})")
        if seen.get("free"):
            d3 = (await trip())["days"][2]["stops"]
            v = [s for s in d3 if s.get("at") == 660]
            check(len(v) == 1 and v[0]["name"] == seen["free"] and v[0].get("kindHe") == "כניסה חינם", f"the free place is in day 3 at 11:00 ({[(s.get('time'), s['name'], s.get('kindHe')) for s in d3]})")
            texts = await pg.locator("#log .msg.bot:last-child [data-gact]").all_inner_texts()
            check(any(seen["free"][:15] in x for x in texts), f"a button for its site or map ({texts})")
        # 3. without the smart guide: the device puts the tour in the day by itself
        await pg.evaluate("localStorage.removeItem('masa-ai-test')")
        on = await pg.evaluate("Masa.agent && (() => { try { return !!window.Masa.ai?.enabled?.(); } catch { return null; } })()")
        t3 = await pg.evaluate("(() => { const A = Masa.agent, t = JSON.parse(localStorage.getItem('masa-trips'))[0]; return [A._time('סיור ביום 2 ב-15'), A._time('ביום 2'), A._time('ב-9:30 בבוקר'), A._time('בשעה 4')]; })()")
        check(t3 == ["15:00", None, "09:30", "16:00"], f"the hour is read from the words ({t3})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    # offline / no smart guide: a fresh page
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r2(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r2)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_selector("#agent", timeout=8000)
        await pg.locator("#nav button", has_text="הסוכן").first.click(); await pg.wait_for_selector("#askInput", timeout=8000)
        await pg.fill("#askInput", "סיור הליכה חינמי ביום 1 ב-16"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(1200)
        d1 = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].days[0].stops")
        tour = [s for s in d1 if s.get("tour")]
        check(len(tour) == 1 and tour[0]["time"] == "16:00", f"without the smart guide the device puts the tour in day 1 at 16:00 ({[(s.get('time'), s['name']) for s in d1]})")
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("הכנסתי סיור הליכה חינמי" in last, f"and says so ({last[:70]!r})")
        texts = await pg.locator("#log .msg.bot:last-child [data-gact]").all_inner_texts()
        check(any("להירשם" in x for x in texts) and any("לבטל" in x for x in texts), f"register and undo buttons ({texts})")
        await pg.locator("#log .msg.bot:last-child [data-gact]", has_text="לבטל").first.click(); await pg.wait_for_timeout(500)
        d1 = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].days[0].stops")
        check(not any(s.get("tour") for s in d1), "undo takes it out")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
