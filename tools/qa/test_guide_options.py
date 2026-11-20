"""The guide answers any question with options to act on (2026-11-21, by the owner's choice): the places its answer
names come back as buttons: put it in the trip, go there, and book it (a restaurant's own site or phone, a hotel or
tickets through a partner). Masa never books or pays itself. The smart guide is simulated."""
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
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; reply = {"t": ""}; sysmsgs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = route.request.post_data or ""; sysmsgs.append(body)
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": reply["t"]}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        inTrip = {s["name"] for d in t["days"] for s in d["stops"]}
        food = [p_ for p_ in t.get("places", []) if p_.get("kind") == "restaurant" and p_["name"] not in inTrip and len(p_["name"]) > 4 and p_.get("lat")][:2]
        check(len(food) == 2, "the city has restaurants that are not in the trip")
        reply["t"] = "הנה שתי אפשרויות קרובות:\n" + "\n".join(f"- **{f['name']}** ({f.get('local') or f['name']}): מקום טוב, מחיר בינוני." for f in food) + "\n- **Nowhere Made Up** (Nowhere Made Up): לא קיים."
        await pg.locator("#nav button", has_text="הסוכן").first.click(); await pg.wait_for_selector("#askInput", timeout=8000)
        await pg.fill("#askInput", "איזה מקום שווה לחגוג בו יום הולדת בסגנון?"); await pg.press("#askInput", "Enter")
        await pg.wait_for_timeout(1500)
        btns = await pg.locator("#log .msg.bot:last-child [data-gact]").all_inner_texts()
        check(any("למסלול" in x for x in btns) and any("ניווט" in x for x in btns), f"the answer's places come with buttons ({btns})")
        check(not any("Nowhere" in x for x in btns), "a name the city does not know gets no 'add' or 'book' button")
        check(any("2-3 real options" in m for m in sysmsgs), "the guide is asked for 2-3 options")
        add = pg.locator("#log .msg.bot:last-child [data-gact]", has_text="למסלול").first
        if await add.count():
            await add.click(); await pg.wait_for_timeout(500)
            t2 = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
            check(any(s["name"] == food[0]["name"] for d in t2["days"] for s in d["stops"]), "'add' puts the place in the trip")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
