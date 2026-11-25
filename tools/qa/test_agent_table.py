"""The assistant decides and books a table (2026-11-25, by the owner's choice: "שהוא יחליט מה לעשות"). On the guide
screen every message goes to the agent, which may change the trip by itself; a table it picks goes into the day at its
hour in place of that meal, with a button to reserve it, and it never says the table is booked. A plain question gets a
full answer with buttons for the places it names. The smart guide is simulated."""
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
        pg = await ctx.new_page(); errs = []; mode = {"m": "table"}; seen = {}
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}"); txt = json.dumps(body, ensure_ascii=False)
                if "trip planner inside" not in txt: return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                prm = body["contents"][-1]["parts"][0]["text"]; seen["prm"] = prm; seen["sys"] = txt
                m = re.search(r"^p(\d+) (.+?) \[restaurant", prm, re.M)
                seen["rest"] = m.group(2).strip() if m else None
                if mode["m"] == "table":
                    j = {"say": f"הזמנתי לכם שולחן ב-{seen['rest']}.", "actions": [{"do": "appt", "day": 1, "time": "20:00", "minutes": 90, "title": f"ארוחת ערב ב-{seen['rest']}", "place": f"p{m.group(1)}", "party": 4}], "chips": []}
                else:
                    j = {"say": f"הקולוסיאום נבנה בשנת 80 לספירה. ליד יש את {seen['rest']} ({seen['rest']}) לארוחה טובה.", "actions": [], "chips": []}
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps(j, ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        await pg.goto(URL + "/index.html"); await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_selector("#agent", timeout=8000)
        await pg.locator("#nav button", has_text="הסוכן").first.click(); await pg.wait_for_selector("#askInput", timeout=8000)
        await pg.fill("#askInput", "תמצא לנו מסעדה טובה להערב ב-8"); await pg.press("#askInput", "Enter")
        await pg.wait_for_timeout(2500)
        check("trip planner inside" in seen.get("sys", ""), "a message on the guide screen goes to the agent (no special words needed)")
        check("Be decisive" in seen.get("sys", ""), "the agent is told to decide and act")
        d1 = (await trip())["days"][0]["stops"]
        ap = [s for s in d1 if s.get("at") is not None]
        check(len(ap) == 1 and ap[0]["time"] == "20:00" and seen["rest"] and seen["rest"] in ap[0]["name"], f"the table is in day 1 at 20:00 ({[(s.get('time'), s['name']) for s in d1]})")
        check(not any(s.get("meal") == "dinner" for s in d1), "it replaces that day's dinner")
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("הזמנתי" not in last and "לוחצים על הכפתור" in last, f"it never says it booked ({last[:90]!r})")
        btns = await pg.locator("#log .msg.bot:last-child [data-gact]").all_inner_texts()
        check(any(("להזמין" in x) or ("להתקשר" in x) or ("גוגל מפות" in x) for x in btns), f"a button to reserve it ({btns})")
        # a ready reservation message in the restaurant's language, for WhatsApp (they check it and press send)
        msg = await pg.evaluate("Masa.agent._reserve({cc:'it', days:[{stops:[]}]}, {at: 1200, di: 0, party: 4}).text")
        check("Vorrei prenotare un tavolo per 4 persone" in msg and "20:00" in msg, f"the message is in Italian, for 4, at 20:00 ({msg!r})")
        en = await pg.evaluate("Masa.agent._reserve({cc:'jp', days:[{stops:[]}]}, {at: 1170, di: 0, party: 2}).text")
        check("table for 2 people" in en and "19:30" in en, f"English where we have no template ({en!r})")
        check(await pg.evaluate("Masa.agent._phone({phone:'+39 06 686 4009;+39 333 1'})") == "+39066864009", "the first phone number, digits only")
        wa = [x for x in btns if "וואטסאפ" in x]
        has_phone = await pg.evaluate("(() => { const t = JSON.parse(localStorage.getItem('masa-trips'))[0]; const s = t.days[0].stops.find(s => s.at != null); return String(s.phone || '').trim().startsWith('+'); })()")
        check(bool(wa) == bool(has_phone), f"a WhatsApp button exactly when the place has an international phone ({wa}, phone={has_phone})")
        if wa: check("הודעת הזמנה" in last, "the answer says the message is ready")
        mode["m"] = "question"
        await pg.fill("#askInput", "מתי נבנה הקולוסיאום?"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(2500)
        last = await pg.inner_text("#log .msg.bot:last-child")
        check("שנת 80" in last, "a question gets its answer")
        check("EARLIER IN THIS CHAT" in seen.get("prm", ""), "the agent sees the chat so far")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
