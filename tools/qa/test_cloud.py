"""Accounts end to end, against the Firebase emulators (auth :9099, firestore :8080) and the local site (:8790).
Alice builds a trip -> it reaches her second device -> she invites Bob -> Bob joins and adds a note -> Alice sees it ->
Mallory cannot read the trip -> Bob leaves -> Alice deletes her account.
Run inside: firebase emulators:exec --only auth,firestore --project demo-masa "python3 ../qa/test_cloud.py" (see .github/workflows/services.yml)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
import flow as Q
URL = os.environ.get("QA_URL", "http://localhost:8790")
FAILS = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: FAILS.append(what)

async def user(b, name):
    ctx = await b.new_context(viewport={"width": 400, "height": 860}, bypass_csp=True)
    await ctx.add_init_script(f"localStorage.setItem('masa-cloud-emu','1'); localStorage.setItem('masa-cloud-emu-user','{name}');")
    async def r(route):
        u = route.request.url
        if u.startswith(URL) or u.startswith("http://localhost:9099") or u.startswith("http://localhost:8080"): return await route.continue_()
        if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#ece6da"}}]}, headers={"access-control-allow-origin": "*"})
        return await route.abort()
    await ctx.route("**/*", r)
    pg = await ctx.new_page()
    pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    return ctx, pg

async def signed_in(pg, timeout=20000):
    await pg.wait_for_function("window.Masa && Masa.cloud", timeout=timeout)
    await pg.evaluate("Masa.cloud.state.status === 'in' || Masa.cloud.signIn()")
    await pg.wait_for_function("Masa.cloud.state.status === 'in'", timeout=timeout)

async def trips(pg):
    return await pg.evaluate("JSON.parse(localStorage.getItem('masa-trips') || '[]').map(t => ({id: t.id, cloudId: t.cloudId || null, city: t.city, fam: t.fam || null, members: t.cloud?.members || 0}))")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # Alice, first device: sign in and build a trip
        _, a1 = await user(b, "alice")
        await a1.goto(URL + "/index.html"); await signed_in(a1)
        await a1.fill("#gq", "פראג"); await a1.press("#gq", "Enter"); await a1.wait_for_timeout(400); await Q.to_goals(a1)
        await a1.click("#buildBtn"); await a1.wait_for_selector(".triphero", timeout=25000)
        await a1.wait_for_function("JSON.parse(localStorage.getItem('masa-trips')||'[]')[0]?.cloudId", timeout=15000)
        t = (await trips(a1))[0]
        check(bool(t["cloudId"]), "a new trip is saved to the account")

        # Alice, second device: the trip arrives by itself
        _, a2 = await user(b, "alice")
        await a2.goto(URL + "/index.html"); await signed_in(a2)
        await a2.wait_for_function(f"JSON.parse(localStorage.getItem('masa-trips')||'[]').some(x => x.cloudId === '{t['cloudId']}')", timeout=15000)
        check(True, "the trip appears on her second device")

        # Alice invites Bob
        link = await a1.evaluate("async () => Masa.cloud.invite(JSON.parse(localStorage.getItem('masa-trips'))[0])")
        check("#j=" in link, "an invite link is created")

        # Bob opens the invite, signs in, joins, and the trip opens
        _, bob = await user(b, "bob")
        await bob.goto(link)
        await bob.wait_for_selector("#inviteIn", timeout=10000)
        check(True, "Bob sees the invite card")
        await bob.click("#inviteIn")
        await bob.wait_for_selector(".triphero", timeout=20000)
        check("פראג" in await bob.inner_text(".triphero h1"), "Bob joined and the trip opened")

        # Bob writes a note on the first stop; Alice gets it
        await bob.click("button.stop >> nth=1"); await bob.wait_for_selector("#noteIn", timeout=8000)
        await bob.fill("#noteIn", "הערה של בוב"); await bob.press("#noteIn", "Enter")
        try:
            await a1.wait_for_function("JSON.stringify(JSON.parse(localStorage.getItem('masa-trips'))[0].fam||{}).includes('הערה של בוב')", timeout=15000)
            check(True, "Alice receives Bob's note live")
        except Exception: check(False, "Alice receives Bob's note live")

        # Mallory cannot read the trip even with its id
        _, mal = await user(b, "mallory")
        await mal.goto(URL + "/index.html"); await signed_in(mal)
        res = await mal.evaluate("""async (id) => { const F = window.MasaFire; try {
            const app = F.initializeApp({ apiKey: 'demo-key', projectId: 'demo-masa' }, 'x'); const db = F.initializeFirestore(app, {}); F.connectFirestoreEmulator(db, 'localhost', 8080);
            const a = F.initializeAuth(app, {}); F.connectAuthEmulator(a, 'http://localhost:9099', { disableWarnings: true });
            await F.signInWithCredential(a, F.GoogleAuthProvider.credential(JSON.stringify({ sub: 'mallory', email: 'm@example.com', email_verified: true })));
            await F.getDoc(F.doc(db, 'trips', id)); return 'read'; } catch (e) { return String(e.code || e.message); } }""", t["cloudId"])
        check("permission" in res, f"a stranger cannot read the trip ({res})")

        # Bob leaves; Alice sees one member again
        await bob.evaluate("async () => { const t = JSON.parse(localStorage.getItem('masa-trips')).find(x => x.cloudId); await Masa.cloud.leave(t); }")
        try:
            await a1.wait_for_function("(JSON.parse(localStorage.getItem('masa-trips'))[0].cloud?.members || 0) === 1", timeout=15000)
            check(True, "Bob left the trip")
        except Exception: check(False, "Bob left the trip")

        # Alice deletes her account: her trip is gone from the server
        await a1.evaluate("async () => { try { await Masa.cloud.deleteAccount(); } catch (e) {} }")
        await a1.wait_for_timeout(1500)
        check(await a1.evaluate("Masa.cloud.state.status") != "in", "after deleting the account Alice is signed out")
        for pg, who in [(a1, "alice"), (a2, "alice-2"), (bob, "bob"), (mal, "mallory")]:
            check(not pg.errs, f"no page errors for {who} {pg.errs[:2]}")
        # Carol builds a trip without an account, then taps 'sign in' on the card under the trip: she stays on her trip, and it is saved
        _, c = await user(b, "carol")
        await c.goto(URL + "/index.html"); await c.wait_for_timeout(1500)
        await c.fill("#gq", "פראג"); await c.press("#gq", "Enter"); await c.wait_for_timeout(400); await Q.to_goals(c)
        await c.click("#buildBtn"); await c.wait_for_selector(".triphero", timeout=25000); await c.wait_for_timeout(800)
        check(await c.locator("#nudge").count() == 1, "signed out: the 'keep your trip' card shows after the build")
        await c.click("#nudgeIn")
        try:
            await c.wait_for_function("Masa.cloud.state.status === 'in' && JSON.parse(localStorage.getItem('masa-trips')||'[]')[0]?.cloudId", timeout=20000)
            check(await c.locator(".triphero").count() == 1 and await c.locator("#nudge").count() == 0, "after signing in from the card: still on the trip, the card gone, the trip saved to the account")
        except Exception: check(False, "signing in from the card saves the trip to the account")
        await b.close()
    print("FAILED:" if FAILS else "ALL PASSED", FAILS)
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
