# Approved design — Concept E

- `E-Mobile.dc.html` — primary (mobile first, 390×844).
- `E-Home.dc.html` — desktop.

These are prototype files from the design canvas. They will not run on their own (they need the canvas runtime and their images are canvas-hosted `/_blob/...` URLs). Use them as a **reference for layout, CSS values, copy and interaction logic**:
- markup inside `<x-dc>` = structure; `{{ ... }}` = values produced by `renderVals()` in the script at the bottom;
- `<style>` in `<helmet>` = exact CSS (colours, radii, keyframes, durations);
- `class Component` = behaviour (story hero timer, stack cards, clip-path open, my-trip day logic, booking sheet).

Live, clickable version: the "Concept E" page on the Stella design canvas.
Image mapping: the `/_blob/<id>` images correspond to files in `assets/images/stock/` (see `assets/ASSETS.md`).
