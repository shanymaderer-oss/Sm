"""Diagnosis on the live site: real flight prices from Tel Aviv appear on the 'when do you fly' step, with our partner
id on the booking links."""
import asyncio, os, re
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
CITY = os.environ.get("CITY") or "רומא"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 400, "height": 860})
        res = []
        pg.on("response", lambda r: res.append(r) if r.url.endswith("/flights") else None)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(1500)
        await pg.fill("#gq", CITY); await pg.press("#gq", "Enter"); await pg.wait_for_selector("#flights", timeout=20000)
        await pg.wait_for_timeout(9000)
        for r in res[:3]:
            try: print("FLIGHTS", r.status, (await r.text())[:300])
            except Exception as e: print("FLIGHTS ?", e)
        txt = await pg.inner_text("#flights")
        links = await pg.eval_on_selector_all("#flights a", "a => a.map(x => x.href)")
        print("CARD:", txt.replace("\n", " | ")[:500])
        print("PRICES:", bool(re.search(r"₪\d", txt)), "| MARKER in links:", any("marker=799451" in h for h in links), links[:3])
        await pg.screenshot(path=os.environ.get("QA_OUT", "") + "flights.png", full_page=True)
        await b.close()
asyncio.run(main())
