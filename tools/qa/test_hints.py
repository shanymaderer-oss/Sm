"""The suggestions under 'tell us in your words' change with the city and with what they wrote: the city's best-known
places first, then (with the smart guide, simulated here) ideas that fit what they wrote. A suggestion already in the
text is not offered again."""
import asyncio, os, sys, json
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
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps({"want": [], "skip": [], "ideas": ["ערב בטרסטוורה", "גלידה בג'וליטי", "<i>x</i>"]}, ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg); await pg.wait_for_timeout(1500)
        h = await pg.locator("#wishHints button").all_inner_texts()
        must = await pg.eval_on_selector_all("#wishHints button", "b => b.map(x => x.dataset.h).filter(h => h.startsWith('חייבים לראות את '))")
        check(len(must) >= 2 and any("קולוסיאום" in x or "פנתאון" in x or "טרווי" in x for x in must), f"Rome's best-known places are offered ({must})")
        await pg.click("#wishHints button >> nth=0"); await pg.wait_for_timeout(300)
        notes = await pg.input_value("#notes")
        check(notes.startswith("חייבים לראות את ") and h[0] in notes and h[0] not in await pg.locator("#wishHints button").all_inner_texts(), "a tap adds it to the text, and it is not offered again")
        # with the smart guide: ideas for what they wrote come first
        await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.fill("#notes", "זוג צעיר, אוהבים אוכל טוב ולצאת בערב"); await pg.wait_for_timeout(2500)
        h = await pg.locator("#wishHints button").all_inner_texts()
        check(h[:2] == ["ערב בטרסטוורה", "גלידה בג'וליטי"] and await pg.locator("#wishHints button.ai").count() == 3 and not any("<" in x for x in h), f"the guide's ideas for them come first, cleaned ({h[:4]})")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
