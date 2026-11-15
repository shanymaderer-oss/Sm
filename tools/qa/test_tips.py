"""The smart guide's Hebrew tips (data/sights/*.json, written by tools/ai-sights.mjs) must be clean Hebrew: no letters
of another script inside the Hebrew (Arabic, Greek, Cyrillic, Thai, Korean, niqqud...) and no Hebrew word glued to
Latin letters. On 2026-11-15 about 40 such tips (and ~650 misspelled ones) were fixed by hand. No browser, no network.
Must end with FAILS: []."""
import glob, json, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BROKEN = re.compile(r"[Ͱ-ϿЀ-ӿ԰-֏֑-ׇ؀-ۿ฀-๿぀-ヿ一-鿿가-힯]|[א-ת][A-Za-z]|[A-Za-z][א-ת]")
FAILS, n = [], 0
for f in sorted(glob.glob(os.path.join(ROOT, "data", "sights", "*.json"))):
    city = os.path.basename(f)[:-5]
    for pid, g in json.load(open(f, encoding="utf-8")).get("s", {}).items():
        tip = g[2] if isinstance(g, list) and len(g) > 2 else ""
        if not tip: continue
        n += 1
        if BROKEN.search(tip) or len(tip) > 110 or "<" in tip or ">" in tip: FAILS.append(f"{city} {pid}: {tip}")
for x in FAILS[:30]: print("BAD", x)
print(f"tips checked: {n}")
print("FAILS:", FAILS[:5] if FAILS else [])
sys.exit(1 if FAILS else 0)
