import asyncio, json, base64, zlib
from playwright.async_api import async_playwright
import os; HERE=os.path.dirname(os.path.abspath(__file__)); SP=os.environ.get("QA_OUT", "/tmp/masa-qa/"); os.makedirs(SP, exist_ok=True)
ML=os.environ.get("MAPLIBRE_DIST", os.path.join(HERE, "../../vendor/maplibre-gl-5.24.0/"))
evil = "<img src=x onerror=window.__pwn=1>"
stop = lambda n,lat,lng: {"name":evil+n,"local":"x\"'><svg onload=window.__pwn=2>","cat":"history","kind":"sight","lat":lat,"lng":lng,"time":"10:00\"><img src=x onerror=window.__pwn=3>",
  "website":"javascript:window.__pwn=4","signals":[evil],"booking":{"needed":True,"steps":[evil],"url":"javascript:window.__pwn=5"},"_min":"<b>","q":"<i>","why":evil}
d={"v":1,"id":"t1700000000000","from":evil,"city":"רומא"+evil,"slug":"rome","cc":"it","lat":41.9,"lng":12.49,"summary":evil,
   "opts":{"people":"<img src=x onerror=window.__pwn=6>","days":"3","interests":["food","<x>"],"notes":evil},
   "hotel":{"name":evil,"lat":41.9,"lng":12.49,"website":"javascript:window.__pwn=7"},
   "days":[{"label":evil,"theme":evil,"stops":[stop("a",41.89,12.49),stop("b",41.9,12.48)]}],
   "fam":{"notes":{"k":[{"by":evil,"text":evil}]}}}
raw=json.dumps(d).encode()
c=zlib.compressobj(9,zlib.DEFLATED,-15); z=c.compress(raw)+c.flush()
h="z"+base64.urlsafe_b64encode(z).decode().rstrip("=")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg=await b.new_page(viewport={"width":400,"height":860}); logs=[]
    pg.on("console",lambda m: logs.append(m.text)); pg.on("pageerror",lambda e: logs.append("PAGEERR "+str(e)))
    pg.on("dialog",lambda dlg: logs.append("DIALOG "+dlg.message))
    async def r(route):
      u=route.request.url
      if "localhost" in u: return await route.continue_()
      if "maplibre-gl.js" in u: return await route.fulfill(path=ML+"maplibre-gl.js",content_type="text/javascript",headers={"access-control-allow-origin":"*"})
      if "maplibre-gl.css" in u: return await route.fulfill(path=ML+"maplibre-gl.css",content_type="text/css",headers={"access-control-allow-origin":"*"})
      if "openfreemap.org/styles" in u: return await route.fulfill(json={"version":8,"sources":{},"layers":[{"id":"bg","type":"background","paint":{"background-color":"#ece6da"}}]})
      return await route.abort()
    await pg.route("**/*",r)
    await pg.goto(""+os.environ.get("QA_URL","http://localhost:8790")+"/index.html#t="+h); await pg.wait_for_timeout(2500)
    for sel in ["button.stop >> nth=0", "#nav button[data-k=book]", "#nav button[data-k=plan]"]:
      try: await pg.click(sel); await pg.wait_for_timeout(800)
      except Exception as e: logs.append("CLICKFAIL "+sel)
    pwn=await pg.evaluate("window.__pwn||0")
    bad=await pg.evaluate("[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>!/^(https?:|tel:|mailto:|#)/.test(h))")
    onattrs=await pg.evaluate("[...document.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/.test(a.name))).length")
    print("PWN:",pwn,"| bad hrefs:",bad,"| on* attrs:",onattrs)
    print("screen text:",(await pg.inner_text("#screen"))[:300].replace("\n"," / "))
    print("\n".join(l for l in logs if "Failed to load" not in l)[:2000])
    await b.close()
asyncio.run(main())
