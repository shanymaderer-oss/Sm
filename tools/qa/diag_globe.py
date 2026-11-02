"""Diagnosis on the live site: the globe's imagery (NASA Blue Marble) loads, and nothing asks Esri any more."""
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 800}); seen = []; errs = []
        pg.on("response", lambda r: seen.append((r.status, r.url[:140])) if ("gibs" in r.url or "arcgis" in r.url) else None)
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(9000)
        ok = [s for s in seen if "gibs" in s[1] and s[0] == 200]
        print("GIBS tiles OK:", len(ok), "| other gibs:", [s for s in seen if "gibs" in s[1] and s[0] != 200][:3], "| arcgis:", [s for s in seen if "arcgis" in s[1]][:2])
        print("console errors:", errs[:4])
        await pg.screenshot(path=os.environ.get("QA_OUT", "") + "globe.png")
        await b.close()
asyncio.run(main())
