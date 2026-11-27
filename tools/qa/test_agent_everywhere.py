"""The assistant can be reached from every screen of the trip (2026-11-27, the owner's wish: "שיהיה הכי נגיש שיש"):
a "לשאול את מסע" bar at the bottom of the place, discover and before-the-flight screens opens the agent's conversation
with the question (on a place, the agent is told which place), and a microphone button lets them speak instead of
typing (the browser's dictation; here a fake one). The smart guide is simulated."""
import asyncio, os, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
FAKE_SR = """window.SpeechRecognition = window.webkitSpeechRecognition = class {
  start() { window.__srLang = this.lang; setTimeout(() => { const r = [{ transcript: window.__say || "מה לארוז לטיול" }]; r.isFinal = true;
    this.onresult && this.onresult({ results: [r] }); this.onend && this.onend(); }, 80); }
  stop() { this.onend && this.onend(); } };"""

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (the guide is simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        await ctx.add_init_script(FAKE_SR)
        pg = await ctx.new_page(); errs = []; seen = {"prm": []}
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}"); txt = json.dumps(body, ensure_ascii=False)
                if "trip planner inside" not in txt: return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                prm = body["contents"][-1]["parts"][0]["text"]; seen["prm"].append(prm)
                j = {"say": "הנה תשובה מהסוכן.", "actions": [], "chips": []}
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps(j, ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_selector("#agent", timeout=8000)
        check(await pg.locator("#agentMic").count() == 1, "the route's agent bar has a microphone")
        # 1. the place screen: the question is about that place
        await pg.locator(".stop").first.click(); await pg.wait_for_selector("#askBar", timeout=8000)
        name = await pg.evaluate("(() => { const t = JSON.parse(localStorage.getItem('masa-trips'))[0]; return t.days[0].stops[0].name; })()")
        ph = await pg.get_attribute("#askBarIn", "placeholder"); lab = await pg.get_attribute("#askBarIn", "aria-label")
        check("לשאול את מסע" in ph and name[:20] in (ph + lab), f"the place has 'ask Masa' about it ({ph!r})")
        box = await pg.locator("#askBarMic").bounding_box()
        check(box and box["width"] >= 44 and box["height"] >= 44, f"the microphone is a 44px target ({box})")
        await pg.fill("#askBarIn", "מתי הכי פחות עמוס?"); await pg.press("#askBarIn", "Enter"); await pg.wait_for_timeout(1800)
        check(await pg.locator("#askInput").count() == 1, "sending opens the agent's conversation")
        me = await pg.locator("#log .msg.me").last.inner_text()
        check(me.startswith("על ") and name in me and "מתי הכי פחות עמוס" in me, f"the agent is told which place ({me[:70]!r})")
        check(seen["prm"] and name[:20] in seen["prm"][-1] and "מתי הכי פחות עמוס" in seen["prm"][-1], "the question reaches the agent with the place")
        check("הנה תשובה מהסוכן" in await pg.locator("#log .msg.bot").last.inner_text(), "and the answer shows")
        check(await pg.locator("#askMic").count() == 1, "the agent's screen has a microphone too")
        # 2. discover: a suggestion chip
        await pg.locator("#nav button", has_text="גלו").first.click(); await pg.wait_for_selector("#askBar", timeout=8000)
        n0 = len(seen["prm"])
        await pg.locator("#askBar [data-ask]").first.click(); await pg.wait_for_timeout(1800)
        me = await pg.locator("#log .msg.me").last.inner_text()
        check(await pg.locator("#askInput").count() == 1 and "שאין לנו במסלול" in me and len(seen["prm"]) > n0, f"from discover, a chip asks the agent ({me[:50]!r})")
        # 3. before the flight: speaking
        await pg.locator("#nav button", has_text="הטיול").first.click(); await pg.wait_for_timeout(500)
        await pg.locator('[data-folder="before"]').first.click(); await pg.wait_for_selector("#askBarMic", timeout=8000)
        await pg.click("#askBarMic"); await pg.wait_for_timeout(1800)
        check(await pg.evaluate("window.__srLang") == "he-IL", "dictation listens in Hebrew")
        me = await pg.locator("#log .msg.me").last.inner_text() if await pg.locator("#log .msg.me").count() else ""
        check(await pg.locator("#askInput").count() == 1 and me == "מה לארוז לטיול", f"what they said is sent to the agent ({me!r})")
        # 4. speaking on the agent's screen
        await pg.evaluate("window.__say = 'מה עושים בערב בטרסטוורה'")
        await pg.click("#askMic"); await pg.wait_for_timeout(1800)
        me = await pg.locator("#log .msg.me").last.inner_text()
        check(me == "מה עושים בערב בטרסטוורה", f"the agent's screen hears it too ({me!r})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    # a browser without dictation: no microphone button at all
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        await ctx.add_init_script("delete window.SpeechRecognition; delete window.webkitSpeechRecognition;")
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
        await pg.locator(".stop").first.click(); await pg.wait_for_selector("#askBar", timeout=8000)
        check(await pg.locator(".micbtn").count() == 0, "no microphone where the browser cannot listen")
        await pg.fill("#askBarIn", "מה הבא"); await pg.press("#askBarIn", "Enter"); await pg.wait_for_timeout(1200)
        check(await pg.locator("#log .msg.bot").count() >= 2, "without the smart guide the question is still answered on the device")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILS:", FAILS)
    raise SystemExit(1 if FAILS else 0)
asyncio.run(main())
