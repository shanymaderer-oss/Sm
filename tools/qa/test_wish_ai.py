"""The wishes box, by what the traveler wrote: places they have seen or do not want are left out (on the device, and with
the smart guide's reading for what the rules cannot catch), and places they want are in."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)
GAUDI = ["sagrada", "park güell", "parc güell", "casa batlló", "casa milà", "pedrera"]
async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (the guide is simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; asked = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}")
                if "A traveler planning" not in json.dumps(body, ensure_ascii=False): return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                asked.append(body)
                skip = [{"name": "Sagrada Família", "he": "סגרדה פמיליה"}, {"name": "Park Güell", "he": ""}, {"name": "Casa Batlló", "he": ""}, {"name": "Casa Milà", "he": "לה פדררה"}]
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps({"want": [{"name": "Camp Nou", "he": ""}], "skip": skip})}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        names = lambda t: " | ".join(f"{s['name']} {s.get('local') or ''}" for d in t["days"] for s in d["stops"]).lower()
        # 1. on the device only: "כבר היינו ב..." is out, "חייבים לראות" is in
        await pg.fill("#gq", "ברצלונה"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.fill("#notes", "כבר היינו בסגרדה פמיליה ובפארק גואל, חייבים לראות את קאסה בטלו"); await pg.wait_for_timeout(900)
        prev = await pg.inner_text("#wishOut")
        check("לא נכניס למסלול: סגרדה פמיליה, פארק גואל" in prev and "סגרדה" not in prev.split("נכניס למסלול:")[-1].split("לא נכניס")[0] if "נכניס למסלול:" in prev else False, f"the preview says what is out and what is in: {prev!r}")
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000)
        t = await trip(); n = names(t)
        check("sagrada" not in n and "park güell" not in n and "parc güell" not in n, "places they have been to are not in the trip")
        check("batlló" in n, "the place they must see is in the trip")
        check(any("סגרדה" in x for x in t["wish"].get("skipped", [])), f"the trip says what it left out: {t['wish'].get('skipped')}")
        check(await pg.locator(".wishcard li.skip").count() == 1, "the 'what you asked for' card shows it")
        # 2. with the smart guide: a group ("all of Gaudí") becomes the specific places
        await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "ברצלונה"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.fill("#notes", "בפעם הקודמת עשינו את כל המבנים של גאודי, הפעם משהו אחר"); await pg.wait_for_timeout(2200)
        ai = await pg.locator("#wishAi").inner_text() if await pg.locator("#wishAi").count() else ""
        check("לא נכניס" in ai and "סגרדה פמיליה" in ai and len(asked) == 1, f"the guide's reading is shown under the box: {ai!r}")
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000)
        t = await trip(); n = names(t)
        check(not any(g in n for g in GAUDI), "none of Gaudí's buildings are in the trip")
        check(len(asked) == 1, "the guide is asked once for the same words")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
