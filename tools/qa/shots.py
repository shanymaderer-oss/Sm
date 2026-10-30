import asyncio, sys
from playwright.async_api import async_playwright
import flow as Q
import os; HERE=os.path.dirname(os.path.abspath(__file__)); SP=os.environ.get("QA_OUT", "/tmp/masa-qa/"); os.makedirs(SP, exist_ok=True)
ML=os.environ.get("MAPLIBRE_DIST", os.path.join(HERE, "../../vendor/maplibre-gl-5.24.0/"))
TAG=sys.argv[1] if len(sys.argv)>1 else "d"
W=int(sys.argv[2]) if len(sys.argv)>2 else 400
H=int(sys.argv[3]) if len(sys.argv)>3 else 860
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=await b.new_page(viewport={"width":W,"height":H}); logs=[]
    pg.on("console",lambda m: logs.append(m.text) if m.type in("error","warning") and "Failed to load" not in m.text else None); pg.on("pageerror",lambda e: logs.append("PAGEERR "+str(e)))
    async def r(route):
      u=route.request.url
      if u.startswith(os.environ.get("QA_URL", "http://localhost:8790")): return await route.continue_()
      if "maplibre-gl.js" in u: return await route.fulfill(path=ML+"maplibre-gl.js",content_type="text/javascript",headers={"access-control-allow-origin":"*"})
      if "maplibre-gl.css" in u: return await route.fulfill(path=ML+"maplibre-gl.css",content_type="text/css",headers={"access-control-allow-origin":"*"})
      if "openfreemap.org/styles" in u: return await route.fulfill(json={"version":8,"sources":{},"layers":[{"id":"bg","type":"background","paint":{"background-color":"#ece6da"}}]})
      if "frankfurter" in u: return await route.fulfill(json={"amount":1,"base":"EUR","date":"2026-10-23","rates":{"ILS":3.92}})
      return await route.abort()
    await pg.route("**/*",r)
    await pg.goto(""+os.environ.get("QA_URL","http://localhost:8790")+"/index.html"); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=SP+f"{TAG}_1home.png")
    await pg.fill("#gq","ליסבון"); await pg.press("#gq","Enter"); await pg.wait_for_timeout(700); await Q.to_goals(pg)
    await pg.screenshot(path=SP+f"{TAG}_2goals.png")
    await pg.fill("#notes","עם ילדים, שקיעה יפה, חייבים לראות את מגדל בלם"); await pg.wait_for_timeout(1200)
    await pg.click("#buildBtn"); await pg.wait_for_timeout(600); await pg.screenshot(path=SP+f"{TAG}_3loading.png")
    await pg.wait_for_selector(".triphero",timeout=25000); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=SP+f"{TAG}_4plan.png")
    await pg.evaluate("document.getElementById('scroll').scrollTop=600"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=SP+f"{TAG}_5plan2.png")
    await pg.click("button.stop >> nth=1"); await pg.wait_for_timeout(1200)
    await pg.screenshot(path=SP+f"{TAG}_6place.png")
    await pg.click("#nav button[data-k=discover]"); await pg.wait_for_timeout(1000)
    await pg.screenshot(path=SP+f"{TAG}_7disc.png")
    await pg.click("#nav button[data-k=book]"); await pg.wait_for_timeout(800)
    await pg.screenshot(path=SP+f"{TAG}_8book.png")
    await pg.click("#nav button[data-k=guide]"); await pg.wait_for_timeout(800)
    await pg.screenshot(path=SP+f"{TAG}_9guide.png")
    print("\n".join(logs))
    global FAIL; FAIL = any(l.startswith("PAGEERR") for l in logs)
    await b.close()
FAIL = True
asyncio.run(main())
import sys; sys.exit(1 if FAIL else 0)
