"""The agent speaks first during the trip ("מה עכשיו?" by itself): under the 'now' card it says the next place closes
soon (and moves it to tomorrow in one tap, with undo) or that there is a free hour (a near place of the city, open now,
put in the day at once). Asking "מה עכשיו?" gives the same tip with its buttons. Nothing when not traveling."""
import asyncio, os, sys
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
OUT = os.environ.get("QA_OUT", "/tmp/masa-qa/")
# day 1 as it is at 10:50: the stops before the k-th are passed, the k-th is at `time` with these hours
EDIT = """([time, hours]) => { const L = JSON.parse(localStorage.getItem('masa-trips')), t = L[0], d = t.days[0];
  t.opts.start = '2026-11-03'; t.done = {};
  const k = d.stops.findIndex((s, i) => i > 0 && !s.isHotel && !s.meal && s.meal !== 'hotel');
  d.stops.forEach((s, i) => { if (i < k && !s.isHotel) { s.time = '07:00'; s._min = 30; } });
  const s = d.stops[k]; s.time = time; s._min = 60; s.hours = hours; delete s.at; delete s.booked;
  localStorage.setItem('masa-trips', JSON.stringify(L)); return s.name; }"""
async def main():
  ok = []
  async with async_playwright() as p:
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={"width": 400, "height": 860}, timezone_id="Europe/Prague", geolocation={"latitude": 50.087, "longitude": 14.421}, permissions=["geolocation"])
    async def r(route):
      u = route.request.url
      if "/__ai/" in u: return await route.fulfill(status=503, json={"error": "off"})
      if u.startswith(URL): return await route.continue_()
      if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]}, headers={"access-control-allow-origin": "*"})
      return await route.abort()
    await ctx.route("**/*", r)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.clock.install(time="2026-11-03T10:50:00+01:00")
    await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(500)
    await pg.fill("#gq", "פראג"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
    await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=25000); await pg.wait_for_timeout(1000)
    tip = lambda: pg.evaluate("document.getElementById('nowTip')?.innerText || ''")
    async def reopen(edit=None):
      name = await pg.evaluate(EDIT, edit) if edit else None
      await pg.reload(); await pg.wait_for_selector(".savedtrip", timeout=10000); await pg.click(".savedtrip >> nth=0")
      await pg.wait_for_selector(".triphero"); await pg.wait_for_selector("#agent", timeout=10000); await pg.wait_for_timeout(400)
      return name
    # not on a day of the trip: no tip
    await pg.evaluate("() => { const L = JSON.parse(localStorage.getItem('masa-trips')); L[0].opts.start = '2026-12-01'; localStorage.setItem('masa-trips', JSON.stringify(L)); }")
    await reopen(); t0 = await tip(); print("not traveling:", repr(t0)); ok.append(t0 == "")
    # 1. the next place closes in 20 minutes: not enough time, move it to day 2
    name = await reopen(["11:00", "Mo-Su 09:00-11:20"])
    t1 = await tip(); print("closing:", name, "|", t1.replace("\n", " | ")); ok.append("נסגר ב-11:" in t1 and name in t1 and "להעביר" in t1)
    btn = pg.locator("#nowTip button[data-tip]").first
    h = await btn.evaluate("e => e.getBoundingClientRect().height"); print("button height:", h); ok.append(h >= 44)
    await btn.click(); await pg.wait_for_timeout(500)
    days = await pg.evaluate("n => JSON.parse(localStorage.getItem('masa-trips'))[0].days.map(d => d.stops.some(s => s.name === n))", name)
    say = await pg.evaluate("document.querySelector('.agentsay')?.innerText || ''")
    print("moved:", days[:2], "|", say.replace("\n", " | ")[:160]); ok.append(days[0] is False and days[1] is True and "העברתי" in say)
    ok.append(await pg.locator("#agentUndo").count() == 1)
    await pg.click("#agentUndo"); await pg.wait_for_timeout(400)
    back = await pg.evaluate("n => JSON.parse(localStorage.getItem('masa-trips'))[0].days[0].stops.some(s => s.name === n)", name)
    print("undo -> back on day 1:", back); ok.append(back)
    # 2. it closes in 100 minutes: go now, with a navigation link
    name = await reopen(["11:00", "Mo-Su 09:00-12:30"])
    t2 = await tip(); href = await pg.evaluate("document.querySelector('#nowTip a.chipbtn')?.href || ''")
    print("closes later:", t2.replace("\n", " | "), "|", href[:70]); ok.append("נסגר ב-12:" in t2 and "יהיו לכם שם כשעה" in t2 and href.startswith("https://www.google.com/maps/dir/"))
    # "not now" hides it
    await pg.click("#nowTipX"); await pg.wait_for_timeout(200); ok.append(await tip() == "")
    # 3. a free hour and more before the next stop: a near place, put in the day now
    name = await reopen(["13:30", "Mo-Su 09:00-18:00"])
    t3 = await tip(); print("free time:", t3.replace("\n", " | ")); ok.append("פנויות עד" in t3 and "להכניס" in t3)
    os.makedirs(OUT, exist_ok=True); await pg.screenshot(path=os.path.join(OUT, "agent_now.png"))
    places = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].places.map(p => p.name)")
    await pg.locator("#nowTip button[data-tip]").first.click(); await pg.wait_for_timeout(500)
    d1 = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0].days[0].stops.map(s => [s.name, s.time])")
    say = await pg.evaluate("document.querySelector('.agentsay')?.innerText || ''")
    new = say.split("הכנסתי את ")[-1].split(" עכשיו")[0] if "הכנסתי את " in say else ""
    i_new = next((i for i, s in enumerate(d1) if s[0] == new), -1)
    i_next = next((i for i, s in enumerate(d1) if s[0] == name), -1)
    print("filled:", say[:120], "| new at", i_new, d1[i_new] if i_new >= 0 else None, "| next at", i_next)
    ok.append("הכנסתי" in say and 0 <= i_new < i_next and d1[i_new][0] in places and d1[i_new][1] >= "10:50")
    # asking "מה עכשיו?" gives the next stop and the agent's tip
    name = await reopen(["13:30", "Mo-Su 09:00-18:00"])
    await pg.fill("#agentIn", "מה עכשיו?"); await pg.press("#agentIn", "Enter"); await pg.wait_for_timeout(500)
    say = await pg.evaluate("document.querySelector('.agentsay')?.innerText || ''")
    print("asked:", say.replace("\n", " | ")[:200]); ok.append("פנויות עד" in say and "להכניס" in say)
    print("errors:", errs); ok.append(not errs)
    await b.close()
  print("checks:", ok)
  return all(ok)
sys.exit(0 if asyncio.run(main()) else 1)
