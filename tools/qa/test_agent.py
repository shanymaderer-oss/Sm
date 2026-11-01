"""The agent on the route: the traveler writes what to change, the trip changes at once, new suggestions show, and one
tap undoes it. The smart guide is simulated: we check what it is told (the stops and the city's places by id) and that
only those ids can change the trip; an unknown id or a made-up place does nothing. Without the smart guide, the guide's
answers on the device are used."""
import asyncio, os, sys, json, re
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def main():
    if "localhost" not in URL and "127.0.0.1" not in URL: print("SKIP: runs on a local copy (the guide is simulated)"); return
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 400, "height": 860}, service_workers="block")
        pg = await ctx.new_page(); errs = []; asked = []; answer = {"j": {}}; shapes = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def r(route):
            u = route.request.url
            if "/__ai/generate" in u:
                body = json.loads(route.request.post_data or "{}"); txt = json.dumps(body, ensure_ascii=False)
                if "trip planner inside" not in txt: return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": "{}"}]}}]})
                asked.append(body["contents"][-1]["parts"][0]["text"]); shapes.append(body.get("generationConfig", {}).get("responseSchema"))
                await asyncio.sleep(0.4)
                return await route.fulfill(json={"candidates": [{"content": {"parts": [{"text": json.dumps(answer["j"], ensure_ascii=False)}]}}]})
            if u.startswith(URL): return await route.continue_()
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            return await route.abort()
        await pg.route("**/*", r)
        trip = lambda: pg.evaluate("JSON.parse(localStorage.getItem('masa-trips'))[0]")
        names = lambda t: [[s["name"] for s in d["stops"]] for d in t["days"]]
        await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        # the sample trip has no agent (it cannot be changed)
        await pg.click("#sampleBtn"); await pg.wait_for_selector(".triphero", timeout=20000); await pg.wait_for_timeout(600)
        check(await pg.locator("#agent, #agentSlot").count() == 0, "no agent on the sample trip")
        # with the smart guide (simulated)
        await pg.evaluate("localStorage.setItem('masa-ai-test','1')"); await pg.goto(URL + "/index.html"); await pg.wait_for_timeout(600)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_timeout(500); await Q.to_goals(pg)
        await pg.click("#buildBtn"); await pg.wait_for_selector(".triphero", timeout=40000)
        await pg.wait_for_selector("#agent", timeout=8000)
        top = await pg.evaluate("document.querySelector('#agent').getBoundingClientRect().top - document.querySelector('.triphero').getBoundingClientRect().bottom")
        check(0 <= top < 300, f"the agent is right under the trip header ({top:.0f}px)")
        chips = await pg.locator("#agent [data-ach]").all_inner_texts()
        check(3 <= len(chips) <= 4, f"suggestions to tap before writing anything ({chips})")
        t0 = await trip(); n0 = names(t0)
        # what the guide will answer: remove the 2nd stop of day 2, move day 1's 3rd stop to day 3, add a place, plus junk
        answer["j"] = {"say": "הורדתי תחנה ביום השני כדי שיהיה רגוע יותר, והוספתי מקום יפה.",
                       "actions": [{"do": "remove", "stop": "s2.2"}, {"do": "move", "stop": "s1.3", "day": 3}, {"do": "add", "place": "p1", "day": 2},
                                   {"do": "remove", "stop": "s9.9"}, {"do": "add", "place": "p999"}, {"do": "hack", "stop": "s1.1"}],
                       "chips": ["פחות הליכה ביום 3", "שקיעה בג'יאניקולו", "<b>x</b>"]}
        await pg.fill("#agentIn", "יום שני רגוע יותר"); await pg.press("#agentIn", "Enter")
        await pg.wait_for_timeout(150)
        check(await pg.locator("#agent .agentsay.busy").count() == 1, "while the guide thinks, it says so")
        await pg.wait_for_selector("#agentUndo", timeout=8000); await pg.wait_for_timeout(600)
        prm = asked[-1] if asked else ""
        check("s2.2 " in prm and "\np1 " in prm and "יום שני רגוע יותר" in prm and len(prm) <= 6000, f"the guide is told the stops and the city's places by id, and what they wrote, within the server's limit ({len(prm)} chars)")
        check(bool(shapes and shapes[-1] and shapes[-1]["properties"].get("actions")), "the answer's shape is asked for")
        t1 = await trip(); n1 = names(t1)
        gone, moved = n0[1][1], n0[0][2]
        m = re.search(r"^p1 (.+?)(?: \([^)]*\))? \[", prm, re.M); added = m.group(1).strip() if m else "?"
        check(gone not in sum(n1, []), f"the stop is removed ({gone})")
        check(moved in n1[2] and moved not in n1[0], f"the stop moved to day 3 ({moved})")
        check(added in n1[1], f"the city's place is added to day 2 ({added})")
        check(sum(len(d) for d in n1) == sum(len(d) for d in n0), "unknown ids and made-up actions change nothing")
        say = await pg.inner_text("#agent .agentsay")
        check("רגוע יותר" in say, "the guide says what it changed")
        chips = await pg.locator("#agent [data-ach]").all_inner_texts()
        check(chips[:2] == ["פחות הליכה ביום 3", "שקיעה בג'יאניקולו"] and not any("<" in c for c in chips), f"new suggestions from the guide, cleaned ({chips})")
        check(all(s.get("time") for d in t1["days"] for s in d["stops"]), "the times are set again")
        # a suggestion tap asks again
        answer["j"] = {"say": "אין מה לשנות, היום כבר קליל.", "actions": [], "chips": []}
        n_ask = len(asked)
        await pg.click("#agent [data-ach] >> nth=0"); await pg.wait_for_timeout(1200)
        check(len(asked) == n_ask + 1 and "פחות הליכה ביום 3" in asked[-1], "tapping a suggestion sends it")
        check(await pg.locator("#agentUndo").count() == 0 and names(await trip()) == n1, "no change: nothing to undo, the trip stays")
        # a model that answers with the list of changes only: the changes are made, and said in plain words
        answer["j"] = [{"do": "remove", "stop": "s3.2"}]
        gone3 = n1[2][1]
        await pg.fill("#agentIn", "פחות ביום 3"); await pg.press("#agentIn", "Enter"); await pg.wait_for_selector("#agentUndo", timeout=8000); await pg.wait_for_timeout(400)
        say = await pg.inner_text("#agent .agentsay")
        check(gone3 not in sum(names(await trip()), []) and "הורדתי" in say and gone3 in say, f"a bare list of changes works and is described ({say[:80]!r})")
        await pg.click("#agentUndo"); await pg.wait_for_timeout(500)
        # undo (ask again with a change, then undo)
        answer["j"] = {"say": "הורדתי.", "actions": [{"do": "remove", "stop": "s1.2"}], "chips": ["א", "ב", "ג"]}
        await pg.fill("#agentIn", "תוריד משהו"); await pg.press("#agentIn", "Enter"); await pg.wait_for_selector("#agentUndo", timeout=8000); await pg.wait_for_timeout(400)
        check(len(names(await trip())[0]) == len(n1[0]) - 1, "a second change is made")
        await pg.click("#agentUndo"); await pg.wait_for_timeout(600)
        check(names(await trip()) == n1, "'undo' brings the trip back as it was")
        # the guide fails: a clear message, the trip is untouched
        await pg.unroute("**/*")
        async def r2(route):
            u = route.request.url
            if "/__ai/generate" in u: return await route.fulfill(status=500, json={"error": "x"})
            if u.startswith(URL): return await route.continue_()
            return await route.abort()
        await pg.route("**/*", r2)
        await pg.fill("#agentIn", "עוד משהו"); await pg.press("#agentIn", "Enter"); await pg.wait_for_timeout(2500)
        check("לא" in await pg.inner_text("#agent .agentsay") and names(await trip()) == n1, "if the guide fails: it says so and the trip stays")
        # the guide fails on a common change: the device answers it
        await pg.fill("#agentIn", "אנחנו עייפים, יותר לאט"); await pg.press("#agentIn", "Enter"); await pg.wait_for_timeout(2500)
        txt = await pg.inner_text("#agent .agentsay")
        check(("לוותר" in txt or "קליל" in txt) and await pg.locator("#agent .agentsay [data-gact]").count() >= 1, f"when the guide is not available: a lighter day from the device, with a button ({txt[:60]!r})")
        await pg.click("#agent .agentsay [data-gact] >> nth=0"); await pg.wait_for_timeout(800)
        check(sum(len(d) for d in names(await trip())) == sum(len(d) for d in n1) - 1, "its button makes the change")
        check(not errs, f"no page errors {errs[:2]}")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
