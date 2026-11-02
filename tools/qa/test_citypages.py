"""The city pages for Google (c/<city>.html): a real page in Hebrew with the city's best-known places and a 3-day
idea, valid for search engines (title, description, canonical), accessible, and its button opens the app ready to plan
a trip to that city."""
import asyncio, os, sys
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
AXE = os.environ.get("AXE_JS", "/tmp/axe/node_modules/axe-core/axe.min.js")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block", bypass_csp=True)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            if u.startswith(URL) or "localhost" not in URL: return await route.continue_()
            return await route.abort()
        await pg.route("**/*", r)
        res = await pg.goto(URL + "/c/rome.html")
        check(res.status == 200, "the Rome page exists")
        title = await pg.title(); desc = await pg.get_attribute("meta[name=description]", "content"); canon = await pg.get_attribute("link[rel=canonical]", "href")
        check("רומא" in title and "קולוסיאום" in (desc or "") and canon.endswith("/c/rome.html"), f"title, description and canonical for search engines ({title})")
        places = await pg.locator(".cityplaces li").all_inner_texts()
        check(len(places) >= 8 and "קולוסיאום" in places[0] and not any("רוסתוולי" in x for x in places), f"the best-known places, without statues ({[x[:15] for x in places[:4]]})")
        check(await pg.locator("text=יום 3:").count() == 1, "a 3-day idea")
        if os.path.exists(AXE):
            await pg.add_script_tag(path=AXE)
            v = await pg.evaluate("axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }).then(r => r.violations.map(v => v.id))")
            check(not v, f"accessible ({v})")
        await pg.click("a.btn.coral"); await pg.wait_for_selector("#whenNext, #buildBtn", timeout=15000); await pg.wait_for_timeout(600)
        check("מתי טסים לרומא" in await pg.inner_text(".screen") and "#go" not in pg.url, "its button opens the app planning a trip to Rome")
        res = await pg.goto(URL + "/c/")
        check(res.status == 200 and await pg.locator(".citylist a").count() >= 100, "the list of all city pages")
        sm = await (await pg.request.get(URL + "/sitemap.xml")).text()
        check("/c/rome.html" in sm and sm.count("<url>") >= 100, "sitemap.xml lists them")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
