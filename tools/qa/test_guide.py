"""The guide without any AI key: every quick question gets a real answer from the trip, and its buttons change the trip
(add a place, swap outdoor stops when it rains, remove a stop, a lighter day)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
FALLBACK = "על זה עוד אין לי תשובה"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(800)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(400)
        await pg.click(".tile[data-k=nature]")
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=30000); await pg.wait_for_timeout(800)
        await pg.click("#nav button[data-k=guide]"); await pg.wait_for_selector("#askInput")
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        async def ask(q):
            n = await pg.locator(".msg.bot").count()
            await pg.fill("#askInput", q); await pg.press("#askInput", "Enter")
            await pg.wait_for_function(f"document.querySelectorAll('.msg.bot').length > {n}", timeout=5000)
            last = pg.locator(".msg.bot").last
            return (await last.inner_text()), last
        for q in ["מה הבא?", "איפה לאכול כאן קרוב?", "יש לי שעתיים פנויות", "ספר לי על המקום", "מה עושים בערב?", "אפשר קפה טוב בסביבה?", "הקולוסיאום פתוח עכשיו?"]:
            text, _ = await ask(q)
            check(FALLBACK not in text and len(text) > 20, f"answers '{q}': {text[:70]!r}")
        # adding a place from an answer
        before = sum(len(d["stops"]) for d in (await trip())["days"])
        text, last = await ask("איפה לאכול כאן קרוב?")
        await last.locator("[data-gact]").first.click(); await pg.wait_for_timeout(600)
        after = sum(len(d["stops"]) for d in (await trip())["days"])
        check(after == before + 1, "a place from the answer is added to the trip")
        # rain: outdoor stops become indoor ones
        text, last = await ask("יורד גשם, מה משנים?")
        if await last.locator("[data-gact]").count():
            t0 = await trip(); d0 = t0["days"][0]["stops"]
            await last.locator("[data-gact]").first.click(); await pg.wait_for_timeout(800)
            d1 = (await trip())["days"][0]["stops"]
            outdoor = [s["name"] for s in d1 if s.get("kind") in ("park", "view", "beach", "street", "square", "bridge") and not s.get("meal")]
            check(len(outdoor) < len([s for s in d0 if s.get("kind") in ("park", "view", "beach", "street", "square", "bridge") and not s.get("meal")]), f"rain swaps outdoor stops (left outside: {outdoor})")
        else:
            check("כמעט הכול בפנים" in text, f"rain answer: {text[:80]!r}")
        # remove a stop by name
        name = [s for s in (await trip())["days"][0]["stops"] if not s.get("meal") and not s.get("isHotel")][0]["name"]
        text, last = await ask(f"תוריד את {name}")
        if await last.locator("[data-gact]").count():
            await last.locator("[data-gact]").first.click(); await pg.wait_for_timeout(600)
            check(name not in [s["name"] for s in (await trip())["days"][0]["stops"]], f"'תוריד את {name}' removes it")
        else:
            check(False, f"'תוריד את {name}' understood: {text[:80]!r}")
        # a lighter day
        n0 = len((await trip())["days"][0]["stops"])
        text, last = await ask("אנחנו עייפים, משהו רגוע יותר")
        if await last.locator("[data-gact]").count():
            await last.locator("[data-gact]").first.click(); await pg.wait_for_timeout(600)
        check(len((await trip())["days"][0]["stops"]) <= n0, "a tired traveler gets a lighter day")
        text, _ = await ask("מה השעה בטוקיו?")
        check(FALLBACK in text, "an unrelated question without the AI says what it can do")
        check(not errs, f"no page errors {errs[:2]}")

        # the guide for everyone: through our guide server (mocked here), without any key in the browser
        local = "localhost" in URL or "127.0.0.1" in URL
        if not local and not await pg.evaluate("!!(window.MASA_AI && MASA_AI.proxy)"):
            print("SKIP shared guide: not set up on this site yet"); await b.close()
            print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
        sent = []
        async def ai_route(route):
            sent.append(route.request.post_data or "")
            await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "בטוקיו עכשיו ערב. (תשובה מהמדריך החכם)"}]}}]})
        await pg.route("**/generate", ai_route)
        await pg.evaluate("localStorage.setItem('masa-ai-test','1')")
        await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click(".savedtrip >> nth=0"); await pg.wait_for_selector(".triphero", timeout=15000)
        await pg.click("#nav button[data-k=guide]"); await pg.wait_for_selector("#askInput")
        n = await pg.locator(".msg.bot").count()
        await pg.fill("#askInput", "מה השעה בטוקיו?"); await pg.press("#askInput", "Enter")
        for _ in range(40):
            if "המדריך החכם)" in "".join(await pg.locator(".msg.bot").all_inner_texts()): break
            await pg.wait_for_timeout(200)
        body = json.loads(sent[-1]) if sent else {}
        check(len(sent) == 1 and "contents" in body and "key" not in json.dumps(body).lower().replace("keys", ""), "a question nobody else answers goes to the shared guide, without any key")
        check(await pg.evaluate("!localStorage.getItem('masa-gemini-key')"), "no key is stored in the browser")
        text, _ = await ask("מה הבא?")
        check(len(sent) == 1, "questions about the trip are still answered locally (no server call)")
        # a question about now: the guide searches the web first and shows its sources
        def ai_fresh(route):
            sent.append(route.request.post_data or "")
            return route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "לפי האתר הרשמי, סגור ב-25 בדצמבר. (תשובה עדכנית)"}]}}], "sources": [{"title": "Vatican", "url": "https://www.museivaticani.va/hours"}, {"title": "x", "url": "javascript:alert(1)"}]})
        await pg.unroute("**/generate"); await pg.route("**/generate", ai_fresh)
        n0 = len(sent)
        await pg.fill("#askInput", "הוותיקן פתוח בחג המולד?"); await pg.press("#askInput", "Enter")
        for _ in range(40):
            if "תשובה עדכנית" in "".join(await pg.locator(".msg.bot").all_inner_texts()): break
            await pg.wait_for_timeout(200)
        body = json.loads(sent[-1]) if len(sent) > n0 else {}
        check(body.get("search", {}).get("q") == "הוותיקן פתוח בחג המולד?", "a question about now asks the server to search first")
        srcs = await pg.evaluate("[...document.querySelectorAll('.msg.bot')].pop().querySelectorAll('.srcs a').length")
        bad = await pg.evaluate("[...document.querySelectorAll('.srcs a')].some(a => !a.href.startsWith('https://'))")
        check(srcs == 1 and not bad, f"the answer shows its sources as links, only safe ones ({srcs})")
        # English descriptions on a place page become Hebrew through the shared guide
        tr = []
        async def ai_tr(route):
            body = json.loads(route.request.post_data or "{}"); tr.append(body)
            await route.fulfill(json={"texts": ["תרגום: " + x[:20] for x in body.get("texts", [])]})
        await pg.route("**/__ai/translate", ai_tr)
        t = await trip()
        target = next(((di, si) for di, d in enumerate(t["days"]) for si, st in enumerate(d["stops"]) if st.get("whyLang") == "en"), None)
        if target:
            await pg.click("#nav button[data-k=plan]"); await pg.wait_for_timeout(300)
            if target[0]: await pg.click(f".daytab[data-i='{target[0]}']"); await pg.wait_for_timeout(300)
            await pg.click(f"button.stop >> nth={target[1]}"); await pg.wait_for_timeout(1200)
            body = await pg.inner_text(".screen")
            check(len(tr) >= 1 and "תרגום:" in body and "תרגום של המלצה" in body, "an English recommendation is shown in Hebrew, with its source")
            await pg.click("#backPlan"); await pg.wait_for_timeout(200)
            await pg.click(f"button.stop >> nth={target[1]}"); await pg.wait_for_timeout(600)
            check(len(tr) == 1, "it is translated once, then kept")
        else:
            print("SKIP no English recommendation in this trip")
        await pg.click("#gearBtn"); await pg.wait_for_timeout(500)
        check(await pg.locator("text=פעיל לכולם").count() > 0, "settings say the guide is on for everyone")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
