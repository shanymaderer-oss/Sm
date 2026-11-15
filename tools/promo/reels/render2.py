import asyncio, sys, subprocess, os, shutil
from playwright.async_api import async_playwright
async def one(p, name):
    vd=f"vid_{name}"; shutil.rmtree(vd, ignore_errors=True)
    b=await p.chromium.launch()
    ctx=await b.new_context(viewport={"width":1080,"height":1920},record_video_dir=vd,record_video_size={"width":1080,"height":1920})
    pg=await ctx.new_page()
    await pg.goto(f"http://localhost:8791/{name}.html"); await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(800)
    await pg.evaluate("start()"); await pg.wait_for_timeout(28300)
    path=await pg.video.path(); await ctx.close(); await b.close()
    d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",path]).decode())
    subprocess.run(["ffmpeg","-y","-v","error","-ss",str(max(0,d-28.3)),"-i",path,"-t","28","-c:v","libx264","-pix_fmt","yuv420p","-r","30","-crf","20","-movflags","+faststart",f"{name}_reel.mp4"],check=True)
    for t in ["1.5","6","12","19"]:
        subprocess.run(["ffmpeg","-y","-v","error","-ss",t,"-i",f"{name}_reel.mp4","-frames:v","1","-vf","scale=270:-1",f"{name}_{t}.png"],check=True)
    subprocess.run(["ffmpeg","-y","-v","error"]+sum([["-i",f"{name}_{t}.png"] for t in ["1.5","6","12","19"]],[])+["-filter_complex","hstack=4",f"{name}_strip.png"],check=True)
async def main():
    async with async_playwright() as p:
        
        for n in sys.argv[1:]: await one(p,n)
asyncio.run(main())
