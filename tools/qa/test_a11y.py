"""Accessibility (WCAG 2.1 A and AA) of every main screen, in the light and the dark theme, checked with axe-core:
names and roles for screen readers, valid ARIA, and enough color contrast. Map pins are left out: their labels fade
with the globe's motion, so their contrast against the moving map cannot be measured reliably. axe-core is installed by the workflow
(AXE_JS points to axe.min.js); it is injected only into this test browser, never into the site."""
import asyncio, sys, os
from playwright.async_api import async_playwright
import flow as Q
U = os.environ.get("QA_URL", "http://localhost:8790")
AXE = open(os.environ.get("AXE_JS", "/tmp/axe/node_modules/axe-core/axe.min.js")).read()
FAILS = []
async def audit(pg, name, out):
    await pg.add_script_tag(content=AXE) if not await pg.evaluate("!!window.axe") else None
    r = await pg.evaluate("""async () => { const r = await axe.run({ exclude: [['.maplibregl-marker']] }, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }, resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0,4).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary||'').split('\\n').slice(1,2).join('')) })) }""")
    for v in r:
        k=v["id"]; out.setdefault(k, {"impact": v["impact"], "help": v["help"], "screens": {}})
        out[k]["screens"][name] = v["nodes"]
async def run(p, scheme):
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, color_scheme=scheme, bypass_csp=True, service_workers="block")
        pg = await ctx.new_page(); out = {}
        async def r(route):
            u = route.request.url
            if "openfreemap.org/styles" in u: return await route.fulfill(json={"version": 8, "sources": {}, "layers": []})
            if u.startswith(U) or "localhost" not in U: return await route.continue_()
            return await route.abort()
        await pg.route("**/*", r)
        await pg.goto(U+"/index.html"); await pg.wait_for_timeout(800); await audit(pg, "home", out)
        await pg.fill("#gq", "רומא"); await pg.press("#gq", "Enter"); await pg.wait_for_selector("#whenNext"); await pg.wait_for_timeout(1200); await audit(pg, "when", out)
        await Q.to_stay(pg); await pg.wait_for_timeout(2000); await audit(pg, "stay", out)
        await Q.to_goals(pg); await audit(pg, "goals", out)
        await pg.click("#buildBtn"); await pg.wait_for_selector("#agent", timeout=90000); await pg.wait_for_timeout(1000); await audit(pg, "plan", out)
        await pg.click("#editDay"); await pg.wait_for_timeout(300); await audit(pg, "plan-edit", out); await pg.click("#editDay")
        for f in ["before","book","together"]:
            await pg.click(f"[data-folder={f}]"); await pg.wait_for_timeout(600); await audit(pg, f, out)
        await pg.click("[data-folder=before]"); await pg.click("#infoCard"); await pg.wait_for_timeout(1000); await audit(pg, "info", out)
        await pg.click("#backInfo"); await pg.click("#moveCard"); await pg.wait_for_timeout(600); await audit(pg, "move", out)
        await pg.click("#nav button[data-k=plan]"); await pg.click("button.stop >> nth=1"); await pg.wait_for_timeout(800); await audit(pg, "place", out)
        await pg.click("#nav button[data-k=discover]"); await pg.wait_for_timeout(800); await audit(pg, "discover", out)
        await pg.click("#nav button[data-k=guide]"); await pg.wait_for_timeout(800); await audit(pg, "agent", out)
        await pg.click("#nav button[data-k=home]"); await pg.wait_for_timeout(500); await pg.click("#gearBtn"); await pg.wait_for_timeout(500); await audit(pg, "settings", out)
        for k, v in out.items():
            FAILS.append(f"{scheme}: {k}")
            print(f"FAIL [{scheme}] {v['impact']} {k}: {v['help']}")
            for s2, nodes in list(v["screens"].items())[:4]: print(f"   [{s2}] " + " | ".join(nodes)[:300])
        if not out: print(f"PASS [{scheme}] no accessibility violations on 15 screens")
        await b.close()
async def main():
    async with async_playwright() as p:
        for scheme in ["light", "dark"]: await run(p, scheme)
    print("FAILED:" if FAILS else "ALL PASSED", FAILS); sys.exit(1 if FAILS else 0)
asyncio.run(main())
