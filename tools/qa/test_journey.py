"""The start of a trip: flights, then where to sleep, then what they like. Flight prices are simulated (our guide server's
/flights); the place to sleep is worked out from the city's own data.
Flights: the cheapest on their dates with the price for everyone, airline in Hebrew, direct or not, a booking link that
carries our marker; cheaper days around them that change the dates; without prices, ready searches on the big sites.
Where to sleep: a recommended area with what is close to it, Booking and Airbnb with the dates and travelers already in,
and 'start the route here' makes the trip start there."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

def fl(price, dep, back, stops=0, airline="W6"):
    return {"price": price, "airline": airline, "depart": dep + "T06:10:00+02:00", "back": back + "T21:40:00+01:00", "stops": stops, "backStops": 0, "minutes": 230,
            "from": "TLV", "to": "FCO", "link": f"https://www.aviasales.com/search/TLV{dep[8:10]}{dep[5:7]}ROM?marker=12345"}

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (prices are simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; asked = []; mode = {"off": False}
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if u.endswith("/flights"):
                body = json.loads(route.request.post_data or "{}"); asked.append(body)
                if mode["off"]: return await route.fulfill(status=503, json={"error": "no flights"})
                d, bk = body["depart"], body["back"]
                if len(d) == 10: return await route.fulfill(json={"flights": [fl(412, d, bk), fl(530, d, bk, 1, "LY")]})
                # the whole month: a cheaper day with the same number of nights, and one with a different length (ignored)
                return await route.fulfill(json={"flights": [fl(289, "2026-11-17", "2026-11-20"), fl(199, "2026-11-10", "2026-11-25")]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        await pg.add_init_script("try { localStorage.setItem('masa-me', JSON.stringify({ form: { start: '2026-11-19', days: 3, people: 2 } })) } catch {}")
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.evaluate("Masa && 0")
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter")
        await pg.wait_for_selector("#flights"); await pg.wait_for_timeout(300)
        await pg.fill("#startDate", "2026-11-19"); await pg.dispatch_event("#startDate", "change"); await pg.wait_for_timeout(1500)
        check("מתי טסים לרומא" in await pg.inner_text(".screen") and "שלב 2 מתוך 4" in await pg.inner_text(".stepof"), "after the destination comes 'when do you fly' (step 2 of 4)")
        check("חוזרים ביום" in await pg.inner_text("#backDay") and "22.11" in await pg.inner_text("#backDay"), "the return day is said (3 days from 19.11 is 22.11)")
        txt = await pg.inner_text("#flights")
        check("₪412" in txt and "₪824 ל-2" in txt and "וויז אייר" in txt and "ישירה" in txt and "עצירה אחת" in txt and "אל על" in txt, f"the cheapest flights, with the price for everyone, the airline and stops ({txt[:120]!r})")
        a = pg.locator("#flights a.btn").first
        check("marker=12345" in (await a.get_attribute("href") or "") and "sponsored" in (await a.get_attribute("rel") or ""), "the booking link carries our marker and says it is a partner link")
        check("Aviasales" in txt and "עמלה" in txt, "it says where the prices are from and that a booking may earn us a commission")
        last = asked[-2:]
        check(any(x["depart"] == "2026-11-19" and x["back"] == "2026-11-22" and x["to"] == "ROM" for x in last) and any(x["depart"] == "2026-11" for x in last), f"it asks for the exact dates and for the month ({last})")
        chips = await pg.locator("[data-fld]").all_inner_texts()
        check(len(chips) == 1 and "17.11" in chips[0] and "₪289" in chips[0], f"a cheaper day around, with the same number of nights ({chips})")
        n = len(asked)
        await pg.click("[data-fld]"); await pg.wait_for_timeout(800)
        check(await pg.input_value("#startDate") == "2026-11-17" and "20.11" in await pg.inner_text("#backDay") and len(asked) > n, "choosing it moves the dates and looks again")
        n = len(asked)
        await pg.click("#dplus"); await pg.wait_for_timeout(1200)
        check(len(asked) > n and asked[-1]["back"][:7] == "2026-11", "more days: the flights are looked up again")
        await pg.click("#dminus"); await pg.wait_for_timeout(1000)
        # without prices: the same search, ready, on the big sites
        mode["off"] = True
        await pg.click("#pplus"); await pg.wait_for_timeout(1500)
        txt = await pg.inner_text("#flights"); hrefs = await pg.eval_on_selector_all("#flights a", "a => a.map(x => x.href)")
        check("₪" not in txt and any("kayak.com/flights/TLV-ROM/2026-11-17/2026-11-20/3adults" in h for h in hrefs) and any("aviasales.com/search/TLV1711ROM20113" in h for h in hrefs), f"without prices: ready searches with the dates and 3 travelers ({hrefs[:3]})")
        mode["off"] = False
        # where to sleep
        await Q.to_stay(pg); await pg.wait_for_timeout(2500)
        check("שלב 3 מתוך 4" in await pg.inner_text(".stepof") and "איפה כדאי לישון ברומא" in await pg.inner_text(".screen"), "then 'where to sleep' (step 3 of 4)")
        cards = await pg.locator(".card.base").all_inner_texts()
        check(len(cards) >= 1 and "מהמקומות הכי מבוקשים במרחק הליכה" in cards[0], f"a recommended area, with what is a walk away ({cards[0][:140] if cards else ''!r})")
        print("INFO areas:", [c.split("\n")[1] if "\n" in c else c[:40] for c in cards])
        links = await pg.eval_on_selector_all(".card.base >> nth=0 >> a", "a => a.map(x => x.href)")
        bk = next((h for h in links if "booking.com" in h), ""); ab = next((h for h in links if "airbnb.com" in h), "")
        check("checkin=2026-11-17" in bk and "checkout=2026-11-20" in bk and "group_adults=3" in bk and "latitude=" in bk, "Booking opens on that area with the dates and travelers")
        check("checkin=2026-11-17" in ab and "adults=3" in ab and "ne_lat=" in ab, "Airbnb opens on that area with the dates and travelers")
        check("₪" in cards[0] and "ללילה" in cards[0], "a rough price for a night there")
        await pg.click("[data-base='0']"); await pg.wait_for_timeout(400)
        check(await pg.locator("[data-base='0'][aria-pressed=true]").count() == 1, "'start the route here' is marked")
        base = await pg.evaluate("JSON.stringify(Masa && 1)")
        await Q.to_goals(pg)
        check("שלב 4 מתוך 4" in await pg.inner_text(".stepof"), "then 'what do you like' (step 4 of 4)")
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000); await pg.wait_for_timeout(500)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        h = t.get("hotel") or {}
        check(h.get("name", "").startswith("ליד") and all(d["stops"][0].get("meal") == "hotel" for d in t["days"]), f"the trip starts each day from the chosen area ({h.get('name')})")
        check(t["opts"].get("start") == "2026-11-17" and t["opts"].get("people") == 3, "the trip has the chosen dates and travelers")
        # back from 'what you like' goes to 'where to sleep', and from there to the flights
        await pg.click("#nav button[data-k=plan]")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
