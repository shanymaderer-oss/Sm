"""What is closed (2026-11-26): after a booking button the agent asks "נסגר?". "כן" puts a ✓ on the stop (the route
shows "✓ נסגר"), "עוד לא" keeps it on the open list, and "מה סגור ומה עוד פתוח?" lists both on the device, without the
smart guide. The agent never marks anything closed by itself. The smart guide is simulated."""
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
        pg = await ctx.new_page(); errs = []; seen = {"calls": 0, "day": 1}
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}"); txt = json.dumps(body, ensure_ascii=False)
                if "trip planner inside" not in txt: return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                seen["calls"] += 1
                prm = body["contents"][-1]["parts"][0]["text"]
                ms = re.findall(r"^p(\d+) (.+?) \[restaurant", prm, re.M)
                m = ms[0] if seen["day"] == 1 else ms[-1]
                seen.setdefault("rest", {})[seen["day"]] = m[1].strip()
                j = {"say": f"בחרתי את {m[1].strip()}. כדי לשמור שולחן, לוחצים על הכפתור.", "actions": [{"do": "appt", "day": seen["day"], "time": "20:00", "minutes": 90, "title": f"ארוחת ערב ב-{m[1].strip()}", "place": f"p{m[0]}", "party": 2}], "chips": []}
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps(j, ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        await pg.goto(URL + "/index.html"); await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_selector("#agent", timeout=8000)
        await pg.evaluate("window.open = () => null")  # the booking site is not opened in the test
        await pg.locator("#nav button", has_text="הסוכן").first.click(); await pg.wait_for_selector("#askInput", timeout=8000)
        await pg.fill("#askInput", "תזמין לנו שולחן להערב ב-8"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(2500)
        rest = seen["rest"][1]
        st = [s for s in (await trip())["days"][0]["stops"] if s.get("at") is not None][0]
        check(not st.get("booked") and st.get("kindHe") != "שולחן שמור", f"a table it picked is not marked closed or 'reserved' ({st.get('kindHe')})")
        btn = pg.locator("#log .msg.bot:last-child [data-gact]").filter(has_text=re.compile("להזמין|להתקשר|גוגל מפות|וואטסאפ")).first
        await btn.click(); await pg.wait_for_timeout(1800)
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("נסגר" in last and rest in last, f"after the booking button it asks whether it was closed ({last[:80]!r})")
        yes = pg.locator("#log .msg.bot:last-child [data-gact]", has_text="כן, נסגר")
        check(await yes.count() == 1 and await pg.locator("#log .msg.bot:last-child [data-gact]", has_text="עוד לא").count() == 1, "buttons: yes / not yet")
        box = await yes.bounding_box(); check(box and box["height"] >= 40, f"the buttons are big enough to tap ({box and box['height']})")
        await yes.click(); await pg.wait_for_timeout(600)
        st = [s for s in (await trip())["days"][0]["stops"] if s.get("at") is not None][0]
        check(st.get("booked") is True and st.get("kindHe") == "שולחן שמור", "yes: the stop is marked closed and saved")
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("סגור ✓" in last and rest in last, f"it shows what is closed ({last[:120]!r})")
        # a second table on day 2: not yet
        seen["day"] = 2
        await pg.fill("#askInput", "ותזמין לנו גם שולחן ביום 2 ב-8"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(2500)
        rest2 = seen["rest"][2]
        btn = pg.locator("#log .msg.bot:last-child [data-gact]").filter(has_text=re.compile("להזמין|להתקשר|גוגל מפות|וואטסאפ")).first
        await btn.click(); await pg.wait_for_timeout(1800)
        await pg.locator("#log .msg.bot:last-child [data-gact]", has_text="עוד לא").click(); await pg.wait_for_timeout(500)
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("פתוח" in last and "סימנתי" not in last, f"not yet: it stays open ({last[:80]!r})")
        d2 = [s for s in (await trip())["days"][1]["stops"] if s.get("at") is not None]
        check(d2 and not d2[0].get("booked"), "not yet: no ✓")
        # the list, on the device (no smart guide call)
        n = seen["calls"]
        await pg.fill("#askInput", "מה סגור ומה עוד פתוח?"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(700)
        last = await pg.inner_text("#log .msg.bot:last-child")
        check(seen["calls"] == n, "the list is answered on the device")
        done_part, _, open_part = last.partition("עוד פתוח")
        check(rest in done_part and rest2 in open_part and open_part.index(rest2) < 40, f"closed and open in their places ({last[:200]!r})")
        acts = await pg.locator("#log .msg.bot:last-child [data-gact]").all_inner_texts()
        check(any("כבר נסגר" in a for a in acts), f"an open item can be marked closed from the list ({acts})")
        # the route shows the ✓
        await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(800)
        check(await pg.locator(".stop .tag.free", has_text="נסגר").count() == 1, "the route shows ✓ נסגר on the closed table")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
