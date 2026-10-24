#!/usr/bin/env python3
"""Write a new VERSION into sw.js from a hash of every shell file, so a release reaches every visitor.
Run from the repo root before committing a release: python3 tools/stamp-sw.py"""
import hashlib, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
sw = (root / "sw.js").read_text(encoding="utf-8")
files = re.findall(r'"([^"]+)"', sw[sw.index("const SHELL = ["):sw.index("];", sw.index("const SHELL = ["))])
h = hashlib.sha256()
for f in files:
    p = root / ("index.html" if f == "./" else f)
    h.update(p.read_bytes())
v = h.hexdigest()[:10]
sw = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{v}";', sw)
(root / "sw.js").write_text(sw, encoding="utf-8")
print("sw.js VERSION =", v, f"({len(files)} files)")
