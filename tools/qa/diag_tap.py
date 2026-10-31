"""Diagnosis: on an iPhone (Safari's engine), the 'where to sleep' screen of a Paris trip: does each button respond to a tap?"""
import asyncio, os
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
def note(*a): print("NOTE", *a, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.webkit.launch()
        ctx = await b.new_context(**p.devices["iPhone 13"], locale="he-IL")
        await ctx.add_init_script("try { localStorage.setItem('masa-nostats', 'true') } catch {}")
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(2000)
        await pg.fill("#gq", "פריז"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(2000)
        await Q.to_stay(pg); await pg.wait_for_timeout(3000)
        btn = pg.locator("[data-base='0']")
        await btn.scroll_into_view_if_needed()
        box = await btn.bounding_box(); note("start-here button box:", box)
        top = await pg.evaluate("(() => { const b = document.querySelector(\"[data-base='0']\").getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el ? el.tagName + '.' + el.className + ' #' + el.id : 'none'; })()")
        note("what is under the middle of the button:", top)
        await btn.tap(); await pg.wait_for_timeout(800)
        note("after tap, pressed:", await pg.locator("[data-base='0']").get_attribute("aria-pressed"), "| hotel:", await pg.evaluate("JSON.stringify(window.Masa && 1)"))
        for name in ["Booking", "Airbnb", "מלונות במפה"]:
            a = pg.locator(".card.base >> nth=0 >> a", has_text=name).first
            if not await a.count(): note(name, "link not found"); continue
            await a.scroll_into_view_if_needed()
            top = await pg.evaluate(f"(() => {{ const a = [...document.querySelectorAll('.card.base a')].find(x => x.innerText.includes({name!r})); const r = a.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return (el === a || a.contains(el)) ? 'the link itself' : (el ? el.tagName + '.' + el.className : 'none'); }})()")
            try:
                async with ctx.expect_page(timeout=8000) as np:
                    await a.tap()
                newp = await np.value; note(name, "tap opened:", newp.url[:120], "| on top:", top); await newp.close()
            except Exception as e: note(name, "tap did NOT open a page:", str(e)[:80], "| on top:", top)
        note("errors:", errs)
        await b.close()
asyncio.run(main())
