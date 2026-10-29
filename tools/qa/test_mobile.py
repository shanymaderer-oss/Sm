"""Real phones, as close as a robot gets: Safari's engine on an iPhone and Chrome on an Android phone, against the live
site with the real network. Each phone: the home screen fits the screen, a trip is built, a place opens, the guide answers
(a quick question and an open one), 'I have places' suggests as you type, the hotel search finds a hotel, the trip is
shared as a picture, it is installable (manifest, icons), and it opens again with no internet. Screenshots in QA_OUT."""
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright
URL = os.environ.get("QA_URL", "https://shanymaderer-oss.github.io/Sm")
OUT = os.environ.get("QA_OUT", "/tmp/masa-qa/"); os.makedirs(OUT, exist_ok=True)
FAILS = []; NOTES = []
def check(ok, what, phone):
    print(("PASS " if ok else "FAIL ") + f"[{phone}] {what}", flush=True)
    if not ok: FAILS.append(f"{phone}: {what}")

async def run(p, phone, engine, device):
    b = await getattr(p, engine).launch()
    ctx = await b.new_context(**p.devices[device], locale="he-IL", timezone_id="Asia/Jerusalem", accept_downloads=True)
    await ctx.add_init_script("try { localStorage.setItem('masa-nostats', 'true') } catch {}")  # a test is not a visitor
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    shot = lambda n: pg.screenshot(path=f"{OUT}{phone}-{n}.png")
    t0 = time.time()
    await pg.goto(URL + "/index.html", wait_until="load"); await pg.wait_for_timeout(2500)
    NOTES.append(f"{phone}: home in {time.time()-t0:.1f}s")
    fits = await pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    check(fits, "the home screen fits the width (no sideways scrolling)", phone)
    await shot("1-home")
    # installable
    man = await pg.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())")
    icons = [i["src"] for i in man.get("icons", [])]
    ok_icons = await pg.evaluate("srcs => Promise.all(srcs.map(s => fetch(new URL(s, document.querySelector('link[rel=manifest]').href)).then(r => r.ok))).then(a => a.every(Boolean))", icons)
    check(bool(man.get("name")) and man.get("display") in ("standalone", "fullscreen") and ok_icons and any("512" in json.dumps(i) for i in man["icons"]), f"installable on the home screen ({man.get('name')}, {len(icons)} icons)", phone)
    check(await pg.evaluate("!!document.querySelector('link[rel=apple-touch-icon]')"), "has an iPhone home-screen icon", phone)
    # build a trip
    await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(1200)
    await shot("2-goals")
    # 'I have places': suggestions as you type
    await pg.tap("[data-mode=mine]")
    await pg.fill("#myIn", "פנתא"); await pg.wait_for_timeout(2500)
    sug = await pg.locator("#mySug [data-mysug]").all_inner_texts()
    check(any("פנתאון" in s for s in sug), f"'I have places' suggests as you type ({sug[:2]})", phone)
    if sug: await pg.locator("#mySug [data-mysug]").first.tap()
    # hotel search on the real map
    await pg.fill("#hotelInput", "Hotel Artemide"); await pg.wait_for_timeout(4000)
    hs = await pg.locator("#hotelSug [data-h]").all_inner_texts()
    check(any("Artemide" in h for h in hs), f"the hotel search finds the hotel ({hs[:2]})", phone)
    if hs:
        await pg.locator("#hotelSug [data-h]").first.tap(); await pg.wait_for_timeout(300)
        check("מצאנו" in await pg.inner_text("#hotelOk"), "it says the hotel was found", phone)
    await shot("3-mine-hotel")
    t0 = time.time()
    await pg.tap("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=90000); await pg.wait_for_timeout(1500)
    NOTES.append(f"{phone}: trip built in {time.time()-t0:.1f}s")
    t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
    names = " ".join(s["name"] + " " + (s.get("local") or "") for d in t["days"] for s in d["stops"])
    check(len(t["days"]) >= 1 and sum(len(d["stops"]) for d in t["days"]) >= 8, f"a trip is built ({len(t['days'])} days)", phone)
    check("Pantheon" in names or "פנתאון" in names, "my place is in the trip", phone)
    check("Artemide" in (t.get("hotel") or {}).get("name", "") and all(d["stops"][0].get("meal") == "hotel" for d in t["days"]), f"the trip starts from the chosen hotel ({(t.get('hotel') or {}).get('name')})", phone)
    check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "the trip screen fits the width", phone)
    await shot("4-trip")
    # a place
    await pg.locator("button.stop").nth(1).tap(); await pg.wait_for_timeout(1500)
    body = await pg.inner_text(".screen")
    check(len(body) > 200, "a place opens with its story", phone)
    await shot("5-place")
    await pg.locator("#backPlan").tap(); await pg.wait_for_timeout(800)
    # the guide: a quick question and an open one (the real smart guide)
    await pg.tap("#nav button[data-k=guide]"); await pg.wait_for_selector("#askInput")
    n = await pg.locator(".msg.bot").count()
    await pg.fill("#askInput", "מה הבא?"); await pg.press("#askInput", "Enter"); await pg.wait_for_timeout(1500)
    check(await pg.locator(".msg.bot").count() > n, "the guide answers 'what's next'", phone)
    n = await pg.locator(".msg.bot").count()
    t0 = time.time()
    await pg.fill("#askInput", "איזה מאכל רומאי הכי שווה לנסות?"); await pg.press("#askInput", "Enter")
    for _ in range(60):
        if await pg.locator(".msg.bot").count() > n and "…" not in (await pg.locator(".msg.bot").last.inner_text())[-3:]: break
        await pg.wait_for_timeout(500)
    ans = (await pg.locator(".msg.bot").last.inner_text()) if await pg.locator(".msg.bot").count() > n else ""
    NOTES.append(f"{phone}: smart guide answered in {time.time()-t0:.1f}s")
    check(len(ans) > 30 and "לא הצליח" not in ans and "לא זמין" not in ans, f"the smart guide answers an open question ({ans[:60]!r})", phone)
    await shot("6-guide")
    # share as a picture
    await pg.tap("#nav button[data-k=plan]"); await pg.wait_for_timeout(800)
    try:
        async with pg.expect_download(timeout=20000) as dl:
            await pg.locator("#shareTrip").tap()
        d = await dl.value; path = await d.path()
        size = os.path.getsize(path) if path else 0
        check(d.suggested_filename.endswith(".png") and size > 20000, f"the trip becomes a picture to share ({d.suggested_filename}, {size // 1024} KB)", phone)
        await d.save_as(f"{OUT}{phone}-share.png")
    except Exception as e:
        check(False, f"the trip becomes a picture to share ({str(e)[:80]})", phone)
    # no internet
    await pg.wait_for_timeout(3000)
    sw = await pg.evaluate("navigator.serviceWorker ? navigator.serviceWorker.ready.then(r => !!r.active && !!navigator.serviceWorker.controller).catch(() => false) : false")
    cached = await pg.evaluate("caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.keys())))).then(a => a.flat().length).catch(() => 0)")
    check(sw and cached > 10, f"the offline helper is installed ({cached} files kept on the phone)", phone)
    await ctx.set_offline(True)
    try:
        await pg.reload(wait_until="load", timeout=20000); await pg.wait_for_timeout(2000)
        off = await pg.evaluate("document.body.innerText")
        check("רומא" in off and len(off) > 200, "opens again with no internet, with the trip", phone)
        await shot("7-offline")
    except Exception as e:
        if engine == "webkit" and "internal error" in str(e): NOTES.append(f"{phone}: the robot's Safari cannot reload without internet (a known limit of the test browser): check this on a real iPhone")
        else: check(False, f"opens again with no internet ({str(e)[:80]})", phone)
    await ctx.set_offline(False)
    check(not errs, f"no page errors {errs[:2]}", phone)
    await b.close()

async def main():
    async with async_playwright() as p:
        for phone, engine, device in [("iPhone", "webkit", "iPhone 13"), ("Android", "chromium", "Pixel 7")]:
            try: await run(p, phone, engine, device)
            except Exception as e: check(False, f"the run stopped: {str(e)[:200]}", phone)
    for n in NOTES: print("NOTE " + n)
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
