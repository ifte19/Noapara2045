# Noapara Master Plan 2045 – Interactive Map

Interactive website for the **Final Proposed Land Use Master Plan 2045, Noapara Satellite Growth Centre** (Raozan, Chattogram).
Click any plot, zone, road, CBD site or facility to see area (katha / m² / sq ft / decimal), FAR, MGC, height, setbacks,
households, population, parking and exact coordinates. Pure static site – no server, no build step.

## Deploy free – GitHub Pages
1. Create a free account at github.com → **New repository** (e.g. `noapara-masterplan`), Public.
2. **Add file → Upload files** → drag in *everything inside this folder* (index.html, app.js, style.css, `data/`, `lib/`, `img/`, `downloads/`, `.nojekyll`). Commit.
3. Repository **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
4. After ~1 minute the site is live at `https://<your-username>.github.io/noapara-masterplan/`.

## Deploy free – Vercel
1. Sign in at vercel.com (you can use your GitHub account).
2. **Add New → Project → Import** the GitHub repository above, Framework preset **Other**, no build command, output directory `./`. Deploy.
   (Or install the CLI: `npm i -g vercel`, then run `vercel` inside this folder.)

## Open locally
Double-click `index.html` (works offline except the background maps), or run `python -m http.server` in this folder and open http://localhost:8000.

## Useful links
- Share a plot: `.../index.html?plot=MDR-B004-P017`
- Share a view: the address bar keeps `#zoom/lat/lng` automatically.

## Contents
- `data/*.js` – map layers (WGS 84) exported from the plan (UTM 46N).
- `downloads/` – A1 PDF sheet set, AutoCAD DXF, plot schedule CSV.
- `lib/` – Leaflet 1.9.4 and proj4js (bundled, no CDN needed).

Basemaps: © OpenStreetMap contributors, © CARTO, imagery © Esri. Planning layout for academic review – confirm plot dimensions by cadastral survey.
