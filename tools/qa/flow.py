"""The steps between choosing a destination and 'what do you like': flights (when), where to sleep (stay)."""
async def to_stay(pg):
    await pg.wait_for_selector("#whenNext", timeout=15000); await pg.click("#whenNext")
    await pg.wait_for_selector("#stayNext", timeout=15000)

async def to_goals(pg):
    # the steps open after their code loads; without it (offline, first visit) the site goes straight to 'what you like'
    await pg.wait_for_selector("#whenNext, #stayNext, #buildBtn", timeout=15000)
    if await pg.locator("#whenNext").count():
        await pg.click("#whenNext"); await pg.wait_for_selector("#stayNext", timeout=15000)
    if await pg.locator("#stayNext").count(): await pg.click("#stayNext")
    await pg.wait_for_selector("#buildBtn", timeout=15000)
