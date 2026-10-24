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
| `test_offline.py` | Builds a trip, goes offline, reloads and opens the saved trip from the service worker cache. Must end with `errors: []`. |

Environment: `QA_URL` (default `http://localhost:8790`), `QA_OUT`, `MAPLIBRE_DIST`.

Before a release also run `python3 tools/stamp-sw.py` so visitors get the new version.
