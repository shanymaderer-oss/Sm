import asyncio, sys
from playwright.async_api import async_playwright
URL="http://localhost:8790"
async def main(city, out):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":390,"height":844}, device_scale_factor=2.77)
        async def r(route):
            u=route.request.url
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version":8,"sources":{},"layers":[{"id":"bg","type":"background","paint":{"background-color":"#e9e3d6"}}]})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(URL+"/index.html"); await pg.wait_for_function("window.Masa&&Masa.planner")
        await pg.screenshot(path=out+"_home.png")
        t = await pg.evaluate("""async (q)=>{const t=await Masa.planner.build({query:q,days:3,interests:["history","food","view","night"],budget:"בינוני",pace:"מאוזן",diet:"הכול",move:"walk",notes:"",start:"2026-12-07",people:2},()=>{},null); return t.days.map(d=>d.stops.map(s=>s.time+' '+s.name).join(' | '))}""", city)
        print("\n".join(t))
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2]))
