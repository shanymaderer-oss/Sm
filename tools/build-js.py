#!/usr/bin/env python3
"""Minify js/*.js into js/min/ for the site (smaller download on phones). The readable files in js/ are the source:
edit those, never js/min/. Run automatically by tools/stamp-sw.py, so every release ships fresh minified files.
Top-level names are kept (the files share them as classic scripts); only inner names and whitespace shrink.
js/cloud-config.js stays as it is, so its settings can be edited in place."""
import pathlib, shutil, subprocess, sys
root = pathlib.Path(__file__).resolve().parent.parent
src, out = root / "js", root / "js" / "min"
out.mkdir(exist_ok=True)
local = root / "tools" / "firebase" / "node_modules" / ".bin" / "esbuild"
cmd = [str(local)] if local.exists() else ["npx", "--yes", "esbuild@0.28.2"]
keep = {"cloud-config.js"}
names = sorted(p.name for p in src.glob("*.js"))
for n in names:
    if n in keep:
        continue
    r = subprocess.run(cmd + [str(src / n), "--minify", "--target=es2020", "--charset=utf8", "--log-level=error", f"--outfile={out / n}"], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"build failed for {n}: {r.stderr}")
for old in out.glob("*.js"):
    if old.name not in names or old.name in keep:
        old.unlink()
print(f"js/min: {len(names) - len(keep)} files")
