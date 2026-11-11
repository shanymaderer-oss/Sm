"""Film the live site for a promo video: clean phone-size screenshots (1080x1920) of each step, with the real map,
flight prices and photos. Runs in GitHub Actions (promo-film.yml); the screens come back as an artifact."""
import asyncio, os, sys, datetime
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
OUT = os.environ.get("OUT", "screens"); os.makedirs(OUT, exist_ok=True)
CITY = os.environ.get("CITY", "רומא")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 405, "height": 720}, device_scale_factor=8/3, service_workers="block",
                                  locale="he-IL", timezone_id="Asia/Jerusalem")
        start = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
        await ctx.add_init_script("try{localStorage.setItem('masa-me', JSON.stringify({ form: { start: '%s', days: 3, people: 2 } }))}catch{}" % start)
        pg = await ctx.new_page()
        hide = "#toast,.toast{display:none!important}"
        async def shot(name, wait=800):
            await pg.wait_for_timeout(wait)
            try: await pg.add_style_tag(content=hide)
            except Exception: pass
            await pg.screenshot(path=f"{OUT}/{name}.jpg", type="jpeg", quality=92); print("shot", name)
        async def step(name, fn):
            try: await fn()
            except Exception as e: print("skip", name, str(e)[:160])
        async def scroll_panel(dy):
            await pg.evaluate("""dy => { const el=[...document.querySelectorAll('#panel, #panel *')].find(e => e.scrollHeight > e.clientHeight + 100 && getComputedStyle(e).overflowY.match(/auto|scroll/)); if (el) el.scrollTop += dy; }""", dy)
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(5000)
        await shot("a_home")
        async def typing():
            await pg.click("#gq")
            for ch in CITY: await pg.keyboard.type(ch); await pg.wait_for_timeout(150)
            await shot("b_typing", 1500)
        await step("typing", typing)
        await pg.press("#gq", "Enter")
        async def flights():
            await pg.wait_for_selector("#flights", timeout=20000)
            try: await pg.wait_for_selector(".flrow", timeout=30000)
            except Exception: pass
            await shot("c_flights", 2500)
            await scroll_panel(260); await shot("c2_flights_more")
            if await pg.locator(".bagbox summary").count():
                await pg.click(".bagbox summary"); await pg.locator(".bagbox").scroll_into_view_if_needed(); await shot("d_bags")
        await step("flights", flights)
        async def stay():
            await pg.click("#whenNext"); await pg.wait_for_selector("[data-base]", timeout=30000)
            await shot("e_stay", 4000)
            await pg.click('[data-base="0"]'); await shot("e2_stay_pick", 3000)
        await step("stay", stay)
        async def goals():
            await pg.wait_for_selector("#stayNext, #buildBtn", timeout=15000)
            if await pg.locator("#stayNext").count(): await pg.click("#stayNext")
            await pg.wait_for_selector("#buildBtn", timeout=15000); await shot("f_goals", 1500)
            await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=90000)
            await shot("g_trip", 6000)
        await step("goals", goals)
        async def bigmap():
            await pg.click("#handle"); await shot("h_map_full", 4000)
            await pg.click("#handle"); await pg.wait_for_timeout(1500)
        await step("bigmap", bigmap)
        async def day():
            await scroll_panel(330); await shot("i_day", 2500)
            await scroll_panel(330); await shot("i2_day", 2500)
            await scroll_panel(330); await shot("i3_day", 2500)
        await step("day", day)
        async def food():
            await pg.click('[data-folder="plan"]'); await pg.wait_for_timeout(1000)
            el = pg.locator("#panel :text('לאדם')").first
            await el.scroll_into_view_if_needed(); await scroll_panel(140); await shot("n_food", 2500)
        await step("food", food)
        async def before():
            await pg.click('[data-folder="before"]'); await shot("j_before", 2000)
            await pg.click("#gmapsCard"); await pg.wait_for_selector("#getKml", timeout=10000); await shot("k_gmaps", 1500)
            await pg.click("#backBefore"); await pg.wait_for_timeout(1000)
        await step("before", before)
        async def book():
            await pg.click('[data-folder="book"]'); await shot("l_book", 2500)
            await scroll_panel(330); await shot("l2_book", 1500)
            await pg.click('[data-folder="plan"]'); await pg.wait_for_timeout(1500)
        await step("book", book)
        async def agent():
            box = pg.locator("input[placeholder*='מה לשנות'], textarea[placeholder*='מה לשנות']").first
            await box.click(); await box.type("פחות הליכה ביום הראשון", delay=60); await shot("m_agent", 600)
            await box.press("Enter"); await shot("m2_agent_done", 20000)
        await step("agent", agent)
        await b.close()
asyncio.run(main())
