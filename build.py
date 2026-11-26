from pathlib import Path
root = Path(__file__).parent
html = (root / "index.src.html").read_text(encoding="utf-8")
for marker, name in [("/*PHYS*/", "physics.js"), ("/*LAYOUT*/", "layout.js"), ("/*SOLVE*/", "loopsolve.js"), ("/*GEOM*/", "geom.js"), ("/*R3D*/", "render_loop.js"), ("/*APP*/", "app.js")]:
    html = html.replace(marker, (root / name).read_text(encoding="utf-8"))
(root / "index.html").write_text(html, encoding="utf-8")
print(f"Wrote index.html ({len(html):,} chars)")
