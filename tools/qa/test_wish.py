import asyncio, sys, json, re
from playwright.async_api import async_playwright
import flow as Q
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
# food words that are not "we want good food": "אוכל ללא גלוטן" / "בלי אוכל חריף" must not add or drop food stops
FOOD=[("אוכל ללא גלוטן",[False,False]),("בלי אוכל חריף",[False,False]),("אוכל לא חריף בבקשה",[False,False]),
      ("אוהבים אוכל טוב",[True,False]),("לא בא לנו לעצור לאוכל",[False,True])]
# yes/no wishes: (text, flag, expected)
# Hebrew names of famous places and areas (data/he-names.json): (city, wish, a word that must be in the asked stops, a word that must not)
NAMED=[("פריז","רוצים לראות את מונמארטר","Montmartre",None),("טוקיו","חייבים לראות את מגדל טוקיו","מגדל טוקיו","Forum"),
       ("פראג","רוצים לראות את כיכר ואצלב","Václavské",None),("לונדון","לבקר בשוק קמדן","קמדן",None),("ליסבון","לא לפספס את מגדל בלם","מגדל בלם",None),
       ("רומא","רוצים לראות את וילה בורגזה","בורגזה","Chiesa"),("ברצלונה","אוהבים כדורגל","קאמפ נואו",None),
       ("מדריד","חייבים לראות את סנטיאגו ברנבאו","ברנבאו","Metropolitano"),("סביליה","רוצים לראות את הקתדרלה של סביליה","קתדרל","Pizjuán"),
       ("פראג","רוצים לראות את גשר קארל","קארל","hrad"),("מדריד","לטייל בגראן ויה","Gran Vía",None),("ברלין","חייבים לראות את שער ברנדנבורג","Brandenburger",None)]
FLAGS=[("רוצים מרחצאות",'baths',True),("חמאם טורקי",'baths',True),("thermal baths",'baths',True),("בלי ספא",'baths',False),("ספארי",'baths',False),("רוצים לראות את ספאקה נאפולי",'baths',False),
       ("חם לנו, נעדיף מקומות סגורים כשיורד גשם",'indoor',True),("if it rains, indoors",'indoor',True),("אוהבים פארקים",'indoor',False),
       ("אוהבים כדורגל",'football',True),("רוצים לראות משחק בסטדיום",'football',True),("בלי כדורגל",'football',False),("soccer fans",'football',True)]
# words that only look like a rule: (text, a piece of a label that must or must not show)
LABELS=[("אוהבים שוקולד","שווקים",False),("שוקולד בלגי","קינוחים",True),("שוק פשפשים","שווקים",True),("שוקי איכרים","שווקים",True),
        ("נוסעים באוטובוס","ברכב",False),("נוסעים באוטובוס","ציבורית",True),("שוכרים אוטו","ברכב",True)]
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
    for txt,want in FOOD:
      got=await pg.evaluate("t=>{const w=Masa.intent.parse(t);const h=(s,x)=>[...(s||[])].includes(x);return [h(w.add,'food'),h(w.drop,'food')]}",txt)
      ok=got==want; print("FOOD","ok " if ok else "BAD",txt,"->",got)
      if not ok: FAILS.append(txt)
    for txt,flag,want in FLAGS:
      got=await pg.evaluate("([t,f])=>!!Masa.intent.parse(t)[f]",[txt,flag])
      ok=got==want; print("FLAG","ok " if ok else "BAD",txt,flag,"->",got)
      if not ok: FAILS.append(txt)
    for txt,lab,want in LABELS:
      got=await pg.evaluate("([t,l])=>Masa.intent.parse(t).labels.some(x=>x.includes(l))",[txt,lab])
      ok=got==want; print("LABEL","ok " if ok else "BAD",txt,lab,"->",got)
      if not ok: FAILS.append(txt)
    await pg.close()
    pg=await b.new_page()
    async def only_local(route):
      if route.request.url.startswith(os.environ.get("QA_URL","http://localhost:8790")): return await route.continue_()
      return await route.abort()
    await pg.route("**/*",only_local)
    await pg.goto(os.environ.get("QA_URL","http://localhost:8790")+"/index.html"); await pg.wait_for_function("window.Masa&&Masa.planner")
    for city,txt,want,bad in NAMED:
      t=await pg.evaluate("""async ([q,notes]) => await Masa.planner.build({ query:q, days:3, interests:["history"], budget:"בינוני", pace:"מאוזן", diet:"הכול", move:"walk", notes, start:"2026-12-01", people:2 }, ()=>{}, null)""",[city,txt])
      names=[x["name"] for x in t["wish"]["places"]]+[s["local"] or "" for d in t["days"] for s in d["stops"] if s.get("asked")]
      ok=not t["wish"]["missed"] and any(want in n for n in names) and not (bad and any(bad in n for n in names))
      print("NAMED","ok " if ok else "BAD",city,txt,"->",names,t["wish"]["missed"])
      if not ok: FAILS.append(txt)
    # kosher: every meal and sweet stop is kosher or says it is not; Roman-Jewish cuisine alone is not kosher
    for city in ["לונדון","רומא"]:
      t=await pg.evaluate("""async q => await Masa.planner.build({ query:q, days:3, interests:["food","history"], budget:"בינוני", pace:"מאוזן", diet:"כשר", move:"walk", notes:"", start:"2026-12-01", people:2 }, ()=>{}, null)""",city)
      meals=[s for d in t["days"] for s in d["stops"] if s.get("meal") in ("breakfast","lunch","dinner","treat") and s.get("kind")!="market"]
      silent=[s["name"] for s in meals if "כשר" not in (s.get("signals") or []) and not s.get("notKosher")]
      ok=not silent; print("KOSHER","ok " if ok else "BAD",city,"not kosher and not marked:",silent)
      if not ok: FAILS.append("kosher "+city)
    # readable names: in cities with their own script, stops with an English/Latin name show it (Tokyo was 7 of 14 in Japanese, Belgrade 10 in Cyrillic)
    for city,most in [("טוקיו",3),("בלגרד",4),("אתונה",3)]:
      t=await pg.evaluate("""async q => await Masa.planner.build({ query:q, days:2, interests:["history","food"], budget:"בינוני", pace:"מאוזן", diet:"הכול", move:"walk", notes:"", start:"2026-12-01", people:2 }, ()=>{}, null)""",city)
      bad=[s["name"] for d in t["days"] for s in d["stops"] if not re.search(r"[A-Za-zÀ-ɏ֐-׿]",s["name"])]
      ok=len(bad)<=most; print("NAMES","ok " if ok else "BAD",city,"unreadable:",bad)
      if not ok: FAILS.append("names "+city)
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
      await pg.fill("#gq",city); await pg.press("#gq","Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
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
