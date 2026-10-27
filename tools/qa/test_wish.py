import asyncio, sys, json
from playwright.async_api import async_playwright
import os; HERE=os.path.dirname(os.path.abspath(__file__)); SP=os.environ.get("QA_OUT", "/tmp/masa-qa/"); os.makedirs(SP, exist_ok=True)
ML=os.environ.get("MAPLIBRE_DIST", os.path.join(HERE, "../../vendor/maplibre-gl-5.24.0/"))
CASES=[("רומא","אנחנו זוג עם ילד בן 6, לא אוכלים בשר, חייבים לראות את הקולוסיאום ואת מזרקת טרווי, ובערב שקיעה יפה"),
       ("פריז","בלי מוזיאונים, רוצים לראות את מגדל אייפל ואת מונמארטר, קמים מאוחר, אוהבים קינוחים"),
       ("ברצלונה","קצב רגוע, סבתא מתקשה בהליכה, חייבים את סגרדה פמיליה ופארק גואל, חוף ים"),
       ("פראג","חיי לילה, בירה, בלי כנסיות, לא לפספס את גשר קארל, גרים במלון Hotel Josef"),
       ("לונדון","שומרים כשרות, רוצים לראות את הביג בן ואת הלונדון איי, תחבורה ציבורית")]
PARSE=[("אנחנו 2 מבוגרים ו-3 ילדים",5,None),("2 מבוגרים",2,None),("אנחנו 4",4,None),
       ("טסים עם הורים מבוגרים",None,"walking"),("לא הרבה הליכה",None,"walking"),("בלי הרבה הליכה",None,"walking"),
       ("זוג עם ילד בן 6",3,None),("אנחנו זוג ושני ילדים",4,None),("זוג + 2 ילדים",4,None),("זוג עם תינוקת",3,None),("זוג",2,None),("זוג בלי ילדים",2,None)]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    sel = [int(x) for x in sys.argv[1:]] or range(len(CASES))
    # the parser alone: text -> (travelers, mobility); a wrong reading fails the run
    pg=await b.new_page(); await pg.goto(os.environ.get("QA_URL","http://localhost:8790")+"/index.html"); await pg.wait_for_timeout(500)
    for txt,ppl,mob in PARSE:
      got=await pg.evaluate("t=>{const w=Masa.intent.parse(t);return [w.people||null,w.mobility||null]}",txt)
      ok=got==[ppl,mob]; print("PARSE","ok " if ok else "BAD",txt,"->",got)
      if not ok: FAILS.append(txt)
    await pg.close()
    for i in sel:
      city,txt=CASES[i]
      pg=await b.new_page(viewport={"width":400,"height":860}); errs=[]
      pg.on("pageerror",lambda e: errs.append(str(e)))
      async def r(route):
        u=route.request.url
        if u.startswith(os.environ.get("QA_URL", "http://localhost:8790")): return await route.continue_()
        if "maplibre-gl.js" in u: return await route.fulfill(path=ML+"maplibre-gl.js",content_type="text/javascript")
        if "openfreemap.org/styles" in u: return await route.fulfill(json={"version":8,"sources":{},"layers":[{"id":"bg","type":"background","paint":{"background-color":"#ece6da"}}]})
        return await route.abort()
      await pg.route("**/*",r)
      await pg.goto(""+os.environ.get("QA_URL","http://localhost:8790")+"/index.html"); await pg.wait_for_timeout(900)
      await pg.fill("#gq",city); await pg.press("#gq","Enter"); await pg.wait_for_timeout(500)
      await pg.fill("#notes",txt); await pg.wait_for_timeout(1500)
      print("\n=====",city,"|",txt)
      print("PREVIEW:",(await pg.inner_text("#wishOut")).replace("\n"," / "))
      print("FORM:",await pg.evaluate("JSON.stringify({i:Masa?1:0})"), await pg.evaluate("[...document.querySelectorAll('[aria-pressed=true]')].map(b=>b.innerText.trim()).join(',')"))
      await pg.screenshot(path=SP+f"w{i}_goals.png")
      await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero",timeout=25000); await pg.wait_for_timeout(800)
      print("CARD:",(await pg.evaluate("document.querySelector('.wishcard')?.innerText||'-'")).replace("\n"," / "))
      n=await pg.evaluate("document.querySelectorAll('.daytab').length")
      for d in range(n):
        await pg.click(f".daytab >> nth={d}"); await pg.wait_for_timeout(300)
        print(f" day{d+1}:", " | ".join(await pg.evaluate("[...document.querySelectorAll('button.stop')].map(b=>(b.querySelector('.mealtag')?.innerText||'')+':'+b.querySelector('.t').innerText+' '+(b.querySelector('.meta')?.innerText.split('\\n')[0]||''))")))
      await pg.click(".daytab >> nth=0"); await pg.wait_for_timeout(300)
      await pg.screenshot(path=SP+f"w{i}_plan.png")
      if errs: print("ERRORS",errs); FAILS.append(city)
      await pg.close()
    await b.close()
FAILS = []
asyncio.run(main())
import sys; sys.exit(1 if FAILS else 0)
