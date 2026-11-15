import asyncio, subprocess, glob, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={"width":1080,"height":1920},record_video_dir="vid",record_video_size={"width":1080,"height":1920})
        pg=await ctx.new_page()
        await pg.goto("http://localhost:8791/reel.html"); await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(800)
        await pg.evaluate("start()"); await pg.wait_for_timeout(28300)
        path=await pg.video.path(); await ctx.close(); await b.close()
        print(path)
asyncio.run(main())
