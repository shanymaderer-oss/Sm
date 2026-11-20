"""The agent as a trip secretary (2026-11-21, by the owner's choice after using an AI travel assistant abroad): the
traveler tells it about an appointment ("יש לי פגישה ביום 2 ב-14:00 ב-…") or asks for a reminder ("תזכיר לי לעשות
צ'ק-אין מחר ב-10"). The appointment goes into that day at its own hour, the rest of the day moves around it, and both can
go to the phone's calendar. An address it cannot find is said honestly. The smart guide is simulated."""
import asyncio, os, json
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
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block", accept_downloads=True)
        pg = await ctx.new_page(); errs = []; answer = {"j": {}}; asked = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}"); txt = json.dumps(body, ensure_ascii=False)
                if "trip planner inside" not in txt: return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                asked.append(body); await asyncio.sleep(0.3)
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps(answer["j"], ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        await pg.goto(URL + "/index.html"); await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_selector("#agent", timeout=8000)
        t0 = await trip()
        where = t0["days"][1]["stops"][2]["name"]  # a place the trip knows, so no address search is needed
        answer["j"] = {"say": "הכנסתי את הפגישה ליום השני ב-14:00, ואזכיר לכם לעשות צ'ק-אין.",
                       "actions": [{"do": "appt", "day": 2, "time": "14:00", "minutes": 90, "title": "פגישה עם דני", "where": where},
                                   {"do": "remind", "day": 1, "time": "10:00", "text": "צ'ק-אין לטיסה"}], "chips": []}
        await pg.fill("#agentIn", "יש לי פגישה עם דני ביום 2 ב-14:00, ותזכיר לי לעשות צ'ק-אין"); await pg.press("#agentIn", "Enter")
        await pg.wait_for_selector("#agentUndo", timeout=8000); await pg.wait_for_timeout(800)
        prm = asked[-1]["contents"][-1]["parts"][0]["text"] if asked else ""
        sysmsg = json.dumps(asked[-1], ensure_ascii=False) if asked else ""
        check("Day 2 (" in prm and "km walking" in prm, "the guide is told each day (with its date)")
        check('"appt"' in sysmsg and '"remind"' in sysmsg, "the guide may answer with an appointment or a reminder")
        t1 = await trip(); d2 = t1["days"][1]["stops"]
        ap = [s for s in d2 if s.get("at") is not None]
        check(len(ap) == 1 and ap[0]["name"] == "פגישה עם דני" and ap[0]["time"] == "14:00", f"the appointment is in day 2 at 14:00 ({[(s['time'], s['name']) for s in d2]})")
        check(ap and ap[0].get("_min") == 90 and ap[0].get("lat") is not None, "it lasts 90 minutes and has its place on the map")
        mins = lambda s: int(s["time"][:2]) * 60 + int(s["time"][3:]) if s.get("time") else 0
        i = d2.index(ap[0]) if ap else 0
        check(all(mins(s) <= 14 * 60 for s in d2[:i] if s.get("meal") != "hotel") and all(mins(s) >= 14 * 60 for s in d2[i + 1:]), "the day is ordered around it")
        check(any(r_.get("text") == "צ'ק-אין לטיסה" and r_.get("at") == 600 for r_ in t1.get("reminders", [])), "the reminder is kept with the trip")
        btns = await pg.locator("#agent [data-gact]").all_inner_texts()
        check(any("ליומן" in x for x in btns), f"a button puts them in the phone's calendar ({btns})")
        if any("ליומן" in x for x in btns):
            async with pg.expect_download() as dl:
                await pg.locator("#agent [data-gact]", has_text="ליומן").first.click()
            path = await (await dl.value).path(); ics = open(path, encoding="utf-8").read()
            check("BEGIN:VEVENT" in ics and "פגישה עם דני" in ics and "צ'ק-אין לטיסה" in ics and "VALARM" in ics, "the calendar file has both, with an alert")
        # an address it cannot find: said, and nothing is added
        answer["j"] = {"say": "הכנסתי את ההופעה.", "actions": [{"do": "appt", "day": 3, "time": "20:00", "title": "הופעה", "where": "Via Inesistente 999"}], "chips": []}
        n_before = sum(len(d["stops"]) for d in (await trip())["days"])
        await pg.fill("#agentIn", "יש לי הופעה ביום 3 ב-20:00 ב-Via Inesistente 999"); await pg.press("#agentIn", "Enter")
        await pg.wait_for_timeout(4000)
        say = await pg.inner_text("#agent .agentsay")
        check("לא מצאתי את הכתובת" in say and "הכנסתי" not in say, f"an address it cannot find is said honestly ({say[:80]!r})")
        check(sum(len(d["stops"]) for d in (await trip())["days"]) == n_before, "and nothing is added")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
