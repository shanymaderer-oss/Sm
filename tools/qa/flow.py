"""The steps between choosing a destination and 'what do you like': flights (when), where to sleep (stay)."""
async def to_stay(pg):
    await pg.wait_for_selector("#whenNext", timeout=15000); await pg.click("#whenNext")
    await pg.wait_for_selector("#stayNext", timeout=15000)

async def to_goals(pg):
    if await pg.locator("#whenNext").count(): await pg.click("#whenNext")
    await pg.wait_for_selector("#stayNext", timeout=15000); await pg.click("#stayNext")
    await pg.wait_for_selector("#buildBtn", timeout=15000)
