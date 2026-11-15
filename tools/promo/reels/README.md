# City reels (Instagram / TikTok / Shorts)

Text-only 9:16 reels: a hook, one scene per day with a tip, and the site's home screen at the end ("הקישור בביו").

1. `python3 shot_site.py "<city>" <name>`: screenshots the site's home (local server on :8790) as `<name>_home.png`, and prints the planner's route for ideas.
2. Copy `budapest.html`, change the texts and the image name. Fonts: copy the Fredoka (hebrew + latin) and IBM Plex Sans Hebrew woff2 files from `fonts/` next to it.
3. Serve the folder on :8791 and run `python3 render.py` (records 28 s with Playwright), then
   `ffmpeg -ss <duration-28.3> -i vid/*.webm -t 28 -c:v libx264 -pix_fmt yuv420p -r 30 -crf 20 <city>_reel.mp4`.
