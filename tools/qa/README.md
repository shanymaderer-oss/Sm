# QA scripts

Browser checks to run before every release. They need Python Playwright. MapLibre is served from `vendor/`, so nothing else is needed:

```
pip install playwright && playwright install chromium
python3 -m http.server 8790 &   # from the repo root
```

| Script | What it checks |
|---|---|
| `test_wish.py` | The free-text wishes box: what is understood in the preview, the "מה שביקשתם" card, and that named places land in the trip (Rome, Paris, Barcelona, Prague, London). Pass case numbers to run some: `python3 test_wish.py 0 3` |
| `test_sec.py` | Opens a malicious shared-trip link (HTML and `javascript:` in every field). Must print `PWN: 0 | bad hrefs: [] | on* attrs: 0`. |
| `shots.py TAG [width height]` | Screenshots of home, wishes, loading, plan, place, discover, bookings and guide into `$QA_OUT` (default `/tmp/masa-qa/`). Run at 400×860 (phone) and 1360×860 (desktop). |
| `test_now.py` | The "עכשיו בטיול" card: no card before the trip, next stop of today, done/skip, walking time from the traveler, end of day, and the saved trip opening on today. Must end with all checks True. |
| `test_mine_edit.py` | "יש לי מקומות": suggestions as you type, typed names and a neighborhood become chips, the trip is built around them with our recommendations; then changing the day: move, remove, replace with a nearby alternative, move to another day, order by distance. |
| `test_journey.py` | The start of a trip (simulated prices): flights for the dates with the price for everyone, cheaper days around them that move the dates, ready searches without prices; where to sleep (an area named after what is close, Booking/Airbnb with dates and travelers), and "start the route here". `flow.py` walks these steps for the other tests. |
| `test_mine_any.py` | "יש לי מקומות" with places not on our list: a restaurant picked from the map search (simulated) goes in at its spot as a meal, a café and a shop typed by hand are looked up when building. |
| `test_wish_ai.py` | The wishes box by what was written: "כבר היינו ב..." and "לא רוצים את..." leave those places out (with their twins on the map), and the smart guide's reading (simulated) catches groups like "all of Gaudí". |
| `test_ratings.py` | Restaurant ratings against a pretend Tripadvisor (local only): low-rated meals are replaced by 4.5+ restaurants from our own list, ratings show, nothing from Tripadvisor is stored. |
| `test_rain.py` | A trip that starts in two days with a pretend rainy forecast: the day shows the forecast and offers to swap the stops outside for indoor places nearby; a dry forecast shows nothing. Must end with `FAILS: []`. |
| `test_offline.py` | Builds a trip, goes offline, reloads and opens the saved trip from the service worker cache. Must end with `errors: []`. |

Environment: `QA_URL` (default `http://localhost:8790`), `QA_OUT`, `MAPLIBRE_DIST`.

Before a release also run `python3 tools/stamp-sw.py` so visitors get the new version.

## Daily checks

- `.github/workflows/health.yml` runs every night on GitHub against the live site (all scripts above). If something breaks it opens an issue labelled `site-check` (GitHub emails the owner) and closes it once it passes again. Screenshots are kept for 7 days as a run artifact.
- A scheduled Claude run every morning follows the `masa-daily-checkup` skill: checks, at most one small safe improvement, and a line in `tools/qa/daily-log.md`.
