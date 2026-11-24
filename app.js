/* Noapara Master Plan 2045 – interactive map v2 (Leaflet, no build step) */
(function () {
'use strict';
const S = window.SUMMARY, D = window.DATA, ST = S.stats, TY = S.typology;
const KATHA = 66.8901;
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
proj4.defs('EPSG:32646', '+proj=utm +zone=46 +datum=WGS84 +units=m +no_defs');
const toUTM = (lat, lng) => proj4('EPSG:4326', 'EPSG:32646', [lng, lat]);

// ================================================================== MAP + BASEMAPS
const map = L.map('map', { zoomControl: false, preferCanvas: true, maxZoom: 21, minZoom: 12, zoomSnap: 0.5 }).setView(S.center, 15);
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
const T = (u, o) => L.tileLayer(u, Object.assign({ maxNativeZoom: 19, maxZoom: 21 }, o));
const BASE = {
  light: { name: 'Light (CARTO)', layer: T('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxNativeZoom: 20, attribution: '© OpenStreetMap © CARTO' }) },
  osm: { name: 'Street map (OpenStreetMap)', layer: T('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }) },
  sat: { name: 'Satellite (Esri World Imagery)', layer: L.layerGroup([T('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
    T('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')]) },
  topo: { name: 'Topographic (Esri)', layer: T('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' }) },
  dark: { name: 'Dark (CARTO)', layer: T('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxNativeZoom: 20, attribution: '© OpenStreetMap © CARTO' }) },
  none: { name: 'No basemap', layer: L.layerGroup([]) }
};
let curBase = 'light'; BASE.light.layer.addTo(map);
function setBaseOpacity(o) { const l = BASE[curBase].layer; (l.eachLayer ? (f => l.eachLayer(f)) : (f => f(l)))(t => t.setOpacity && t.setOpacity(o)); }

const PANES = { lu: 401, zone: 415, catch: 408, plots: 412, roads: 420, fac: 430, pts: 440, labels: 445, sel: 450 };
const R = {};
for (const [k, z] of Object.entries(PANES)) { map.createPane(k).style.zIndex = z; R[k] = L.canvas({ pane: k, padding: 0.3, tolerance: 3 }); }
map.getPane('labels').style.pointerEvents = 'none';

// ================================================================== STATE / CONSTANTS
const OP = { landuse: .85, zones: .45, plots: .95, localroads: 1, cbdplots: .95, cbdopen: .9, mlcp: 1, roads: .95, facilities: .95, cbdpoints: 1, khas: .85, water: .95, river: .9, roundabouts: 1, cbdsectors: .9 };
let selected = null; const temp = L.layerGroup().addTo(map);
const ZONENAME = { HDR: 'High-density residential', MDR: 'Medium-density residential', LDR: 'Low-density residential', MXU: 'Mixed-use corridor' };
const ZHEIGHT = { HDR: 'G+5 (≈20 m)', MDR: 'G+3 (≈14 m)', LDR: 'G+2 (≈11 m)', MXU: 'G+5 (≈20 m), shops at ground floor' };
const ZROAD = { HDR: '9 m local street', MDR: '7.5 m local street', LDR: '6 m local street', MXU: '6 m service lane behind a 3.5 m tree verge' };
const NORM = { SC: 100, SS: 100, RS: 100, RT: 100, LS: 100, KB: 100, FL: 100, BS: 100, EN: 100, BK: 200, FO: 200, OF: 200, HT: 200, CV: 200, CS: 200, LB: 200, MQ: 200, PH: 300 };
const RC = { ARTERIAL: '#8e1b1b', COLLECTOR: '#e07b24', TERTIARY: '#5b5b5b', LOCAL: '#9e9e9e' };
const TINT = { ARTERIAL: '#d8b4b4', COLLECTOR: '#f6d2ae', TERTIARY: '#e0e0e0' };
const ROADSPEC = {
  ARTERIAL: { lanes: '4 lanes, divided', speed: 60, cap: '≈ 3,600 PCU/h (both directions)', access: 'No plot access; joins collectors only at roundabouts', light: 'Double-arm street lights every 35 m', trees: 'Avenue trees every 16 m both sides' },
  COLLECTOR: { lanes: '2–4 lanes', speed: 40, cap: '≈ 1,400–2,800 PCU/h', access: 'Plots via service lanes only; bus bays on CBD Avenue & Z1629', light: 'Street lights every 30 m', trees: 'Avenue trees every 16 m' },
  TERTIARY: { lanes: '2 lanes', speed: 30, cap: '≈ 900 PCU/h', access: 'Collects local streets; school & park frontage', light: 'Street lights every 30 m', trees: 'Trees where verge allows' },
  LOCAL: { lanes: '1–2 lanes, shared', speed: 20, cap: '≈ 300–400 PCU/h', access: 'Direct plot access, pedestrians first', light: 'Pole lights every 25 m', trees: 'Back-garden green strips' } };
const XS = { // cross-section strips [label, metres, colour]
  'ARTERIAL-30': [['FP', 2.5, '#c9c9c9'], ['Green / drain', 2, '#8fcf8a'], ['Carriageway', 7.5, '#4a4a4a'], ['Median', 3, '#43a047'], ['Carriageway', 7.5, '#4a4a4a'], ['Cycle', 1.5, '#e0b04c'], ['Green / drain', 2, '#8fcf8a'], ['Utility', 1.5, '#b0bec5'], ['FP', 2.5, '#c9c9c9']],
  'COLLECTOR-30': [['FP', 3, '#c9c9c9'], ['Trees / bus bay', 3, '#8fcf8a'], ['Carriageway', 7, '#4a4a4a'], ['Median', 4, '#43a047'], ['Carriageway', 7, '#4a4a4a'], ['Trees', 3, '#8fcf8a'], ['FP', 3, '#c9c9c9']],
  'COLLECTOR-24': [['FP', 2.5, '#c9c9c9'], ['Drain', 1.5, '#8fcf8a'], ['Carriageway', 7, '#4a4a4a'], ['Median', 2, '#43a047'], ['Carriageway', 7, '#4a4a4a'], ['Drain', 1.5, '#8fcf8a'], ['FP', 2.5, '#c9c9c9']],
  'COLLECTOR-18': [['FP', 2.5, '#c9c9c9'], ['Drain', 1.5, '#8fcf8a'], ['Carriageway', 10, '#4a4a4a'], ['Drain', 1.5, '#8fcf8a'], ['FP', 2.5, '#c9c9c9']],
  'TERTIARY-12': [['FP', 2.5, '#c9c9c9'], ['Carriageway', 7, '#4a4a4a'], ['FP', 2.5, '#c9c9c9']],
  'LOCAL-9': [['FP', 1.5, '#c9c9c9'], ['Carriageway', 6, '#4a4a4a'], ['FP', 1.5, '#c9c9c9']],
  'LOCAL-7.5': [['FP', 1.25, '#c9c9c9'], ['Carriageway', 5, '#4a4a4a'], ['FP', 1.25, '#c9c9c9']],
  'LOCAL-6': [['Edge', .75, '#c9c9c9'], ['Shared surface', 4.5, '#6d6d6d'], ['Edge', .75, '#c9c9c9']] };

// ================================================================== HELPERS
const gj = (d, o) => L.geoJSON(d, o);
function ringXY(ll) { const lat0 = ll[0].lat * Math.PI / 180, R0 = 6378137; return ll.map(p => [p.lng * Math.PI / 180 * R0 * Math.cos(lat0), p.lat * Math.PI / 180 * R0]); }
function plotSVG(layer, color, setback) {
  let ll = layer.getLatLngs(); while (Array.isArray(ll[0])) ll = ll[0];
  const xy = ringXY(ll), xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const W = 320, H = 190, pad = 26, sc = Math.min((W - 2 * pad) / (maxx - minx), (H - 2 * pad) / (maxy - miny));
  const P = xy.map(p => [pad + (p[0] - minx) * sc, H - pad - (p[1] - miny) * sc]);
  const pts = P.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  // side lengths
  let labels = '';
  for (let i = 0; i < P.length - 1; i++) { const a = xy[i], b = xy[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 4) continue;
    const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2;
    labels += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="10" fill="#1b2433" text-anchor="middle" dy="-3" paint-order="stroke" stroke="#fff" stroke-width="3">${len.toFixed(1)} m</text>`; }
  return `<svg class="plotsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polygon points="${pts}" fill="${color}" fill-opacity=".55" stroke="#2b2b2b" stroke-width="1.6" stroke-linejoin="round"/>${labels}
  <text x="${W - 6}" y="14" font-size="10" text-anchor="end" fill="#666">N ↑ · drawn to scale</text></svg>`;
}
function xsSVG(cls, width) {
  const key = `${cls}-${width}`, segs = XS[key]; if (!segs) return '';
  const tot = segs.reduce((s, x) => s + x[1], 0), W = 320, sc = (W - 10) / tot; let x = 5, out = '';
  segs.forEach(([lab, m, c]) => { const w = m * sc; out += `<rect x="${x.toFixed(1)}" y="18" width="${w.toFixed(1)}" height="26" fill="${c}" stroke="#fff"/>`;
    if (w > 18) out += `<text x="${(x + w / 2).toFixed(1)}" y="58" font-size="9" text-anchor="middle" fill="#333">${m}</text>`;
    if (w > 40) out += `<text x="${(x + w / 2).toFixed(1)}" y="34" font-size="8.5" text-anchor="middle" fill="#fff">${lab}</text>`; x += w; });
  return `<svg class="plotsvg" width="${W}" height="66" viewBox="0 0 ${W} 66"><text x="5" y="11" font-size="10" fill="#555">Typical cross-section · ${width} m right of way (metres)</text>${out}</svg>`;
}
const gmaps = ll => `<div class="links"><a class="gm" target="_blank" rel="noopener" href="https://www.google.com/maps/@${ll.lat.toFixed(6)},${ll.lng.toFixed(6)},120m/data=!3m1!1e3">Google Maps satellite ↗</a><a class="gm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}">Directions / pin ↗</a></div>`;
const kv = rows => '<div class="kv">' + rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(r => `<b>${r[0]}</b><span>${r[1]}</span>`).join('') + '</div>';
const sec = (t, b) => `<div class="sec"><h5>${t}</h5>${b}</div>`;
function fmtLL(ll) { const u = toUTM(ll.lat, ll.lng); return kv([['Lat / Long', `${ll.lat.toFixed(6)}°N, ${ll.lng.toFixed(6)}°E`], ['UTM 46N', `${fmt(u[0], 1)} E, ${fmt(u[1], 1)} N`]]); }
function showInfo(html) { $('#info-body').innerHTML = html; $('#info').classList.remove('hidden'); $('#info').scrollTop = 0; }
$('#info-close').onclick = () => { $('#info').classList.add('hidden'); clearSel(); };
function clearSel() { if (selected) { selected.remove(); selected = null; } temp.clearLayers(); }
function select(layer) {
  clearSel();
  selected = L.geoJSON(layer.toGeoJSON(), { pane: 'sel', interactive: false, style: { color: '#00c2ff', weight: 4, fill: true, fillOpacity: .12, fillColor: '#00c2ff' },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 12, color: '#00c2ff', weight: 4, fill: false, pane: 'sel' }) }).addTo(map);
}
const mpp = () => 156543.03 * Math.cos(S.center[0] * Math.PI / 180) / Math.pow(2, map.getZoom());
function hover(l, base) { l.on('mouseover', () => l.setStyle({ weight: Math.max(2, base().weight + 1.5), color: '#00c2ff' })); l.on('mouseout', () => l.setStyle(base())); }
const plotW = () => { const z = map.getZoom(); return z >= 19 ? 1.6 : z >= 18 ? 1.2 : z >= 17 ? .9 : z >= 16 ? .6 : .35; };

// ================================================================== LAYERS
const LYR = {};
const click = (fn) => (f, l) => l.on('click', e => { L.DomEvent.stop(e); if (window.__measureOn) { window.__measureAdd(e.latlng); return; } select(l); fn(f.properties, l, e.latlng); });
LYR.river = gj(D.river, { pane: 'lu', renderer: R.lu, interactive: false, style: () => ({ fillColor: '#a9d3ef', fillOpacity: OP.river, weight: 0 }) });
LYR.landuse = gj(D.landuse, { pane: 'lu', renderer: R.lu, style: f => ({ fillColor: f.properties.color, fillOpacity: OP.landuse, weight: 0 }), onEachFeature: click(infoLanduse) });
LYR.water = gj(D.water, { pane: 'lu', renderer: R.lu, style: () => ({ fillColor: '#3a8fd6', fillOpacity: OP.water, color: '#1e6fb3', weight: .8 }),
  onEachFeature: click((p, l, ll) => showInfo(`<h4>Waterbody (preserved)</h4><div class="sub">Pond / canal kept for drainage & retention</div>${kv([['Area', fmt(p.area_ha, 2) + ' ha'], ['Rule', '10 m green buffer, no earth filling']])}${sec('Location', fmtLL(ll))}${gmaps(ll)}`)) });
LYR.khas = gj(D.khas, { pane: 'lu', renderer: R.lu, style: () => ({ fillColor: '#f4b9cb', fillOpacity: OP.khas, color: '#c2185b', weight: 1.5, dashArray: '4 3' }),
  onEachFeature: click((p, l, ll) => showInfo(`<h4>Khas land ${p.id}</h4><div class="sub">Government-owned land – kept unchanged</div>${kv([['Area', fmt(p.area_ha, 2) + ' ha'], ['Status', 'Protected, reserved for public use'], ['Plots placed', 'None']])}${sec('Location', fmtLL(ll))}${gmaps(ll)}`)) });
LYR.zones = gj(D.zones, { pane: 'zone', renderer: R.zone, style: f => ({ fillColor: f.properties.color, fillOpacity: OP.zones, color: '#1b1b1b', weight: 1.8 }),
  onEachFeature: (f, l) => { click(infoZone)(f, l); l.bindTooltip(f.properties.code + ' · ' + f.properties.name, { sticky: true }); } });
const lrStyle = () => ({ fillColor: '#ffffff', fillOpacity: OP.localroads, color: '#a7a7a7', weight: map.getZoom() >= 17 ? 1 : .5 });
LYR.localroads = gj(D.localroads, { pane: 'plots', renderer: R.plots, style: lrStyle,
  onEachFeature: (f, l) => { click(infoLocal)(f, l); hover(l, lrStyle); l.bindTooltip(() => `${f.properties.type} · ${f.properties.width} m`, { sticky: true }); } });
const plotStyle = f => ({ fillColor: TY[f.properties.z].color, fillOpacity: OP.plots, color: '#5b3d12', weight: plotW() });
LYR.plots = gj(D.plots, { pane: 'plots', renderer: R.plots, style: plotStyle,
  onEachFeature: (f, l) => { click(infoPlot)(f, l); hover(l, () => plotStyle(f)); l.bindTooltip(() => `<b>${f.properties.id}</b> · ${fmt(f.properties.a / KATHA, 2)} katha`, { sticky: true, direction: 'top' }); } });
LYR.cbdopen = gj(D.cbdopen, { pane: 'plots', renderer: R.plots, style: () => ({ fillColor: '#5fb760', fillOpacity: OP.cbdopen, weight: 0 }),
  onEachFeature: click((p, l, ll) => showInfo(`<h4>${esc(p.name)}</h4><div class="sub">CBD public open space</div>${kv([['Area', fmt(p.area_ha, 2) + ' ha'], ['Use', 'Landscaped, pedestrian, trees, seating, lighting, water features']])}${sec('Location', fmtLL(ll))}${gmaps(ll)}`)) });
const cbdStyle = f => ({ fillColor: f.properties.color, fillOpacity: OP.cbdplots, color: '#ffffff', weight: plotW() + .3 });
LYR.cbdplots = gj(D.cbdplots, { pane: 'plots', renderer: R.plots, style: cbdStyle,
  onEachFeature: (f, l) => { click(infoCBDPlot)(f, l); hover(l, () => cbdStyle(f)); l.bindTooltip(() => `<b>${f.properties.usename}</b> · ${fmt(f.properties.a / KATHA, 1)} katha`, { sticky: true, direction: 'top' }); } });
LYR.mlcp = gj(D.mlcp, { pane: 'plots', renderer: R.plots, style: () => ({ fillColor: '#455a64', fillOpacity: OP.mlcp, color: '#111', weight: 1.2 }),
  onEachFeature: click((p, l, ll) => showInfo(`<h4>Multi-level car park</h4><div class="sub">${p.id} · public visitor parking at a CBD gateway</div>${kv([['Footprint', fmt(p.footprint) + ' m²'], ['Decks', 'G+5 (6 levels)'], ['Capacity', fmt(p.spaces) + ' cars (25 m²/space incl. ramps)'], ['Purpose', 'Stops cars at the gateway so the CBD core stays walkable']])}${sec('Location', fmtLL(ll))}${gmaps(ll)}`)) });
LYR.cbdsectors = gj(D.cbdsectors, { pane: 'roads', renderer: R.roads, interactive: false, style: f => ({ fill: false, color: f.properties.color, weight: 3, opacity: OP.cbdsectors }) });
const roadStyle = f => { const z = map.getZoom(), m = mpp(), p = f.properties, w = p.width;
  return z >= 17 ? { weight: w / m, color: TINT[p.cls], opacity: OP.roads, lineCap: 'butt' } : { weight: Math.max(p.cls === 'TERTIARY' ? 1.4 : 2.6, w / m), color: RC[p.cls], opacity: OP.roads, lineCap: 'butt' }; };
LYR.roadcasing = gj(D.roads, { pane: 'roads', renderer: R.roads, interactive: false, style: f => ({ weight: roadStyle(f).weight + 2.5, color: '#ffffff', opacity: OP.roads * .9, lineCap: 'butt' }) });
LYR.roadcenter = gj(D.roads, { pane: 'roads', renderer: R.roads, interactive: false, style: f => ({ weight: map.getZoom() >= 17 ? 2 : 0, color: RC[f.properties.cls], opacity: map.getZoom() >= 17 ? OP.roads : 0, dashArray: f.properties.cls === 'TERTIARY' ? '6 6' : null }) });
LYR.roads = gj(D.roads, { pane: 'roads', renderer: R.roads, style: roadStyle,
  onEachFeature: (f, l) => { click(infoRoad)(f, l); hover(l, () => roadStyle(f)); l.bindTooltip(() => `<b>${f.properties.name}</b> · ${f.properties.width} m`, { sticky: true }); } });
LYR.roundabouts = gj(D.roundabouts, { pane: 'roads', renderer: R.roads, style: () => ({ fillColor: '#43a047', fillOpacity: OP.roundabouts, color: '#fff', weight: 1.5 }),
  onEachFeature: click((p, l, ll) => showInfo(`<h4>${esc(p.name)}</h4><div class="sub">Roundabout</div>${kv([['Outer radius', p.outer_r + ' m'], ['Landscaped island', p.island_r + ' m radius'], ['Design speed', '25–30 km/h'], ['Function', 'The only points where collectors meet arterials']])}${sec('Location', fmtLL(ll))}${gmaps(ll)}`)) });
const facStyle = f => ({ fillColor: f.properties.color, fillOpacity: OP.facilities, color: '#111', weight: 1.2 });
LYR.facilities = gj(D.facilities, { pane: 'fac', renderer: R.fac, style: facStyle,
  onEachFeature: (f, l) => { click(infoFacility)(f, l); hover(l, () => facStyle(f)); l.bindTooltip(shortName(f.properties), { permanent: true, direction: 'center', className: 'lbl fac-lbl' }); } });
LYR.cbdpoints = gj(D.cbdpoints, { pane: 'pts',
  pointToLayer: (f, ll) => L.circleMarker(ll, { renderer: R.pts, pane: 'pts', radius: f.properties.code === 'FH' ? 3 : 5.5, color: '#fff', weight: 1.2, fillColor: f.properties.color, fillOpacity: OP.cbdpoints, opacity: OP.cbdpoints }),
  onEachFeature: (f, l) => { l.on('click', e => { L.DomEvent.stop(e); if (window.__measureOn) { window.__measureAdd(e.latlng); return; } select(l); showInfo(`<h4>${esc(f.properties.kind)}</h4><div class="sub">${esc(f.properties.name)}</div>${kv([['Type code', f.properties.code]])}${sec('Location', fmtLL(l.getLatLng()))}${gmaps(l.getLatLng())}`); });
    l.bindTooltip(f.properties.kind, { direction: 'top' }); } });
LYR.catch = L.layerGroup();
LYR.boundary = gj(D.boundary, { pane: 'sel', interactive: false, style: { fill: false, color: '#0b0b0b', weight: 3 } });
LYR.labels = L.layerGroup();
const mouza = L.imageOverlay('img/mouza_overlay.png', S.mouza_bounds, { opacity: .6, pane: 'zone', interactive: false });
['river', 'landuse', 'water', 'khas', 'localroads', 'plots', 'cbdopen', 'cbdplots', 'mlcp', 'cbdsectors', 'roadcasing', 'roads', 'roadcenter', 'roundabouts', 'facilities', 'cbdpoints', 'boundary', 'labels'].forEach(k => LYR[k].addTo(map));

function shortName(p) {
  const c = p.code;
  if (c.startsWith('PS')) return 'PS-' + c.slice(2); if (c.startsWith('HS')) return 'High Sch ' + c.slice(2);
  if (c.startsWith('NC')) return 'NCC-' + c.slice(2); if (c.startsWith('PG')) return 'Park ' + c.slice(2);
  return ({ HOS: 'Central Hospital', FIR: 'Fire Station', POL: 'Police', BUS: 'Bus Terminal', EID: 'Eidgah', DGC: 'Noapara Degree College', MAN: 'Mandir', STP: 'WTP/STP', SWT: 'Waste', VOC: 'Vocational Inst.', CPK: 'Central Park' })[c] || c;
}

// ---- zoom-dependent styling & plot labels
let showPlotLabels = true;
function refreshStyles() {
  const z = map.getZoom();
  LYR.roads.setStyle(roadStyle); LYR.roadcasing.setStyle(f => ({ weight: roadStyle(f).weight + 2.5, color: '#fff', opacity: OP.roads * .9 }));
  LYR.roadcenter.setStyle(f => ({ weight: z >= 17 ? 2 : 0, color: RC[f.properties.cls], opacity: z >= 17 ? OP.roads : 0 }));
  LYR.plots.setStyle(plotStyle); LYR.cbdplots.setStyle(cbdStyle); LYR.localroads.setStyle(lrStyle);
  map.getContainer().classList.toggle('show-fac', z >= 16);
  map.getContainer().classList.toggle('hide-pts', z < 16.5);
  updateLabels();
}
function updateLabels() {
  LYR.labels.clearLayers();
  if (!showPlotLabels || map.getZoom() < 18.5) return;
  const b = map.getBounds(); let n = 0;
  const add = (l, txt) => { const c = l.getBounds().getCenter(); if (!b.contains(c) || n > 700) return; n++;
    LYR.labels.addLayer(L.marker(c, { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'plbl', html: txt, iconSize: null }) })); };
  if (map.hasLayer(LYR.plots)) LYR.plots.eachLayer(l => add(l, `${l.feature.properties.id.split('-').pop()}<br><i>${(l.feature.properties.a / KATHA).toFixed(1)}k</i>`));
  if (map.hasLayer(LYR.cbdplots)) LYR.cbdplots.eachLayer(l => add(l, `${l.feature.properties.use}<br><i>${(l.feature.properties.a / KATHA).toFixed(1)}k</i>`));
}
map.on('zoomend', refreshStyles); map.on('moveend', updateLabels);

// coordinates + hash
map.on('mousemove', e => { const u = toUTM(e.latlng.lat, e.latlng.lng); $('#coords').innerHTML = `${e.latlng.lat.toFixed(5)}°N ${e.latlng.lng.toFixed(5)}°E · UTM ${fmt(u[0])} E ${fmt(u[1])} N · z${map.getZoom()}`; });
map.on('moveend', () => { const c = map.getCenter(); history.replaceState(null, '', location.pathname + location.search + `#${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`); });
map.on('click', e => { if (measure.on) return measure.add(e.latlng); $('#info').classList.add('hidden'); clearSel(); });

// ================================================================== INFO CARDS
function infoPlot(p, layer, ll) {
  const t = TY[p.z], a = p.a, k = a / KATHA, foot = t.mgc * a, gfa = t.far * a, sb = t.setback;
  const park = p.z === 'MXU' ? Math.ceil(a * t.mgc / 100 + (gfa - a * t.mgc) / 300) + ' cars (shops 1/100 m², flats 1/300 m²)'
    : `${Math.ceil(gfa / 300)} (BCR 1996, 1 per ~300 m²) · ${gfa > 200 ? t.units : 1} (BCR 2008, 1 per flat)`;
  const centre = layer.getBounds().getCenter();
  const ring = p.b.includes('-R');
  showInfo(`<div class="badge" style="background:${t.color}">${p.z} · ${t.katha} katha type</div><h4>Plot ${p.id}</h4>
    <div class="sub">${ZONENAME[p.z]} · ${ring ? 'concentric ring sector ' + p.b : p.b === 'CORRIDOR' ? 'mixed-use corridor' : 'neighbourhood block ' + p.b} · ${ring ? 'wedge (roundish) plot' : 'rectangular plot'}</div>
    ${plotSVG(layer, t.color)}
    <div class="big3"><div><b>${fmt(k, 2)}</b><span>katha</span></div><div><b>${fmt(a, 0)}</b><span>m²</span></div><div><b>${fmt(a * 10.7639, 0)}</b><span>sq ft</span></div></div>
    ${sec('Plot size', kv([['Decimal', fmt(k * 1.65, 2)], ['Standard size', `${t.w_ft} ft × ${t.d_ft} ft (${(t.w_ft * .3048).toFixed(2)} × ${(t.d_ft * .3048).toFixed(2)} m)`], ['Fronts onto', ZROAD[p.z]], ['Back opens to', ring ? 'neighbouring plot / ring park' : 'green back-garden strip']]))}
    ${sec('Development controls', kv([['FAR (floor area ratio)', t.far], ['MGC (max ground coverage)', Math.round(t.mgc * 100) + '%'], ['Max building footprint', fmt(foot) + ' m²'], ['Max floor area (GFA)', fmt(gfa) + ' m²'],
      ['Height', ZHEIGHT[p.z]], ['Setbacks front / rear / side', `${sb[0]} / ${sb[1]} / ${sb[2]} m`], ['Open space on plot', fmt(a - foot) + ' m² (' + Math.round(100 - t.mgc * 100) + '%)']]))}
    ${sec('People & parking', kv([['Households (flats)', t.units], ['Persons', t.ppp + ' (4.5 per household, Census 2022)'], ['Car parking', park]]))}
    ${sec('Location (plot centre)', fmtLL(centre))}${gmaps(centre)}
    <div class="links"><button class="btn ghost sm" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.origin+location.pathname+'?plot=${p.id}')">Copy link to this plot</button></div>`);
}
function infoCBDPlot(p, layer, ll) {
  const a = p.a, k = a / KATHA, gfa = 4 * a, big = a >= 1000;
  let req = '-';
  if (p.use === 'MX') req = Math.ceil(a * .65 / 100 + (gfa - a * .65) / 300) + ' (shops 1/100 m², flats 1/300 m²)';
  else if (NORM[p.use]) req = Math.ceil(gfa / NORM[p.use]) + ` (1 car per ${NORM[p.use]} m² GFA)`;
  const centre = layer.getBounds().getCenter();
  showInfo(`<div class="badge" style="background:${p.color}">CBD · ${p.sec} ${esc(p.theme)}</div><h4>${esc(p.usename)}</h4><div class="sub">${p.id} · row ${p.row} · ${big ? 'major site' : 'standard commercial plot'}</div>
    ${plotSVG(layer, p.color)}
    <div class="big3"><div><b>${fmt(k, 2)}</b><span>katha</span></div><div><b>${fmt(a, 0)}</b><span>m²</span></div><div><b>${fmt(gfa, 0)}</b><span>m² max floor area</span></div></div>
    ${sec('Development controls (CBD)', kv([['FAR', '4.0'], ['MGC', '65%'], ['Max footprint', fmt(.65 * a) + ' m²'], ['Height', 'up to G+7 (≈26 m)'], ['Setbacks front / rear / side', big ? '4.5 / 3 / 3 m' : '3 / 2 / 1.5 m'], ['Decimal', fmt(k * 1.65, 2)]]))}
    ${p.use !== 'PK' && p.use !== 'UT' ? sec('Parking (on-site, statutory)', kv([['Required spaces', req], ['Provided in', 'basement + stilt floor']])) : ''}
    ${sec('Location', fmtLL(centre))}${gmaps(centre)}`);
}
function infoZone(p, l, ll) {
  showInfo(`<div class="badge" style="background:${p.color}">${p.code}</div><h4>${esc(p.name)}</h4><div class="sub">${esc(p.purpose)}</div>
    <div class="big3"><div><b>${fmt(p.area_ha, 1)}</b><span>ha</span></div><div><b>${p.pop ? fmt(p.pop) : '—'}</b><span>people</span></div><div><b>${p.density || '—'}</b><span>persons/ha</span></div></div>
    ${sec('Development controls', kv([['Plot size', p.plot], ['Max height', p.height], ['FAR / MGC', p.far_mgc]]))}${sec('Character', `<p>${esc(p.character)}</p>`)}${gmaps(ll)}`);
}
function infoLanduse(p, l, ll) {
  showInfo(`<div class="badge" style="background:${p.color}">${p.grp}</div><h4>${esc(p.name)}</h4><div class="sub">Land-use category (all pieces together)</div>
    ${kv([['Area', fmt(p.area_ha, 2) + ' ha'], ['Share of union', fmt(100 * p.area_ha / 1355.42, 2) + '%']])}${sec('Location clicked', fmtLL(ll))}${gmaps(ll)}`);
}
function infoRoad(p, l, ll) {
  const s = ROADSPEC[p.cls];
  showInfo(`<div class="badge" style="background:${RC[p.cls]}">${p.cls}</div><h4>${esc(p.name)}</h4><div class="sub">Segment ${p.id} · ${p.width} m right of way</div>
    ${xsSVG(p.cls, p.width)}
    <div class="big3"><div><b>${p.width}</b><span>m ROW</span></div><div><b>${fmt(p.length_m)}</b><span>m long</span></div><div><b>${s.speed}</b><span>km/h design</span></div></div>
    ${sec('Design', kv([['Lanes', s.lanes], ['Capacity', s.cap], ['Access rule', s.access], ['Street lighting', s.light], ['Trees', s.trees], ['Surface / drainage', p.cls === 'ARTERIAL' ? 'Bituminous, RCC side drains' : 'Bituminous / RCC, covered side drains']]))}
    ${sec('Connects to', `<p>${esc(p.connects || '—')}</p>${kv([['Roundabouts on segment', p.roundabouts]])}`)}
    ${sec('Location clicked', fmtLL(ll))}${gmaps(ll)}`);
}
function infoLocal(p, l, ll) {
  const s = ROADSPEC.LOCAL;
  showInfo(`<div class="badge" style="background:#8a8a8a">LOCAL</div><h4>${esc(p.type)}</h4><div class="sub">${p.id} · ${ZONENAME[p.zone] || ''} area</div>
    ${xsSVG('LOCAL', p.width)}
    <div class="big3"><div><b>${p.width}</b><span>m wide</span></div><div><b>${fmt(p.length_m)}</b><span>m (network)</span></div><div><b>${fmt(p.plots)}</b><span>plots served</span></div></div>
    ${sec('Design', kv([['Lanes', s.lanes], ['Design speed', s.speed + ' km/h'], ['Capacity', s.cap], ['Access', s.access], ['Lighting', s.light]]))}
    ${sec('Blocks served', `<p>${esc(p.blocks || '—')}</p>`)}${sec('Joins (hierarchy: local → tertiary only)', `<p>${esc(p.connects)}</p>`)}${sec('Location clicked', fmtLL(ll))}${gmaps(ll)}`);
}
const STD = { PS: 'Primary school · 1 per 5,000 people · 500 m walking catchment · ~0.4 ha', HS: 'High school · 1 per 20,000 · 1 km catchment · 1–1.5 ha',
  HOS: '50-bed hospital · 1 per 100,000 · 1 km catchment', NC: 'Neighbourhood centre: kacha market, community health centre, community hall, mosque · 1 per 20,000',
  PG: 'Playground / neighbourhood park · 1 per 10,000 · 400 m', CPK: 'Town park & stadium', FIR: 'Fire station · 1 per 100,000 · on arterial for quick response',
  POL: 'Police station', BUS: 'Inter-district bus & truck terminal on the bypass ring', EID: 'Central eidgah', DGC: 'Existing Noapara Degree College, retained & expanded beside the CBD',
  MAN: 'Temple complex', STP: 'Water treatment & sewage treatment plant', SWT: 'Solid waste transfer station', VOC: 'Vocational & technical institute' };
function infoFacility(p, l) {
  const ll = L.latLng(p.lat, p.lon), std = Object.entries(STD).find(([k]) => p.code.startsWith(k));
  if (p.radius) L.circle(ll, { radius: p.radius, color: p.color, weight: 2, dashArray: '6 4', fillOpacity: .07, pane: 'catch', interactive: false }).addTo(temp);
  showInfo(`<div class="badge" style="background:${p.color}">${p.cat}</div><h4>${p.no}. ${esc(p.name)}</h4><div class="sub">Phase ${p.phase}</div>
    <div class="big3"><div><b>${fmt(p.area_ha, 2)}</b><span>ha site</span></div><div><b>${fmt(p.area_ha * 1e4 / KATHA, 0)}</b><span>katha</span></div><div><b>${p.radius || '—'}</b><span>m catchment</span></div></div>
    ${kv([['Standard', std ? std[1] : '-']])}${sec('Exact location (site centre)', fmtLL(ll))}${gmaps(ll)}`);
}

// ================================================================== TABS
$$('#tabs button').forEach(b => b.onclick = () => {
  $$('#tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active');
  $$('.pane').forEach(x => x.classList.remove('active')); $('#tab-' + b.dataset.tab).classList.add('active'); onTab(b.dataset.tab);
});
function onTab(t) {
  const keep = $('#lt-zones') && $('#lt-zones').checked;
  if (t === 'zones') { if (!map.hasLayer(LYR.zones)) LYR.zones.addTo(map); } else if (!keep && map.hasLayer(LYR.zones)) map.removeLayer(LYR.zones);
  if (t === 'cbd') map.flyToBounds(LYR.cbdsectors.getBounds(), { padding: [30, 30], duration: .8 });
  renderLegend(t);
}
$('#collapse').onclick = () => { $('#side').classList.add('collapsed'); setTimeout(() => map.invalidateSize(), 300); };
$('#expand').onclick = () => { $('#side').classList.remove('collapsed'); setTimeout(() => map.invalidateSize(), 300); };
const bars = (items, unit) => { const max = Math.max(...items.map(i => i[1])); return items.map(i => `<div class="bar"><span class="lab" title="${i[0]}">${i[0]}</span><span class="track"><span class="fill" style="width:${100 * i[1] / max}%;background:${i[2]}"></span></span><span class="num">${fmt(i[1], unit === 'ha' ? 1 : 0)} ${unit}</span></div>`).join(''); };

// OVERVIEW
(function () {
  const grp = {}; ST.part.forEach(([n, g, a]) => grp[g] = (grp[g] || 0) + a);
  const GN = { AGRI: ['Agriculture & char', '#cfc78a'], GREEN: ['Parks, green & open space', '#3d9b45'], ROAD: ['Roads & circulation', '#9e9e9e'], KHAS: ['Khas land', '#f4b9cb'],
    MDR: ['MDR plots (net)', '#f9c46b'], FAC: ['Community facilities', '#3f6fb5'], LDR: ['LDR plots (net)', '#e8d27a'], CBD: ['CBD plots', '#b2182b'], HDR: ['HDR plots (net)', '#f28e2b'],
    WATER: ['Waterbodies', '#3a8fd6'], MXU: ['Mixed-use corridor', '#e8618c'], IND: ['Industrial', '#a58fd0'] };
  const cbdCount = Object.values(ST.cbd_uses).reduce((s, v) => s + v[0], 0);
  const totalPlots = ST.plots.HDR + ST.plots.MDR + ST.plots.LDR + ST.plots.MXU + cbdCount;
  const pops = [['High-density (HDR)', ST.pop.HDR, '#f28e2b'], ['Medium-density (MDR)', ST.pop.MDR, '#f9c46b'], ['Low-density (LDR)', ST.pop.LDR, '#e8d27a'], ['Mixed-use corridor', ST.pop.MXU, '#e8618c'], ['CBD flats', ST.pop.CBD, '#b2182b']];
  $('#tab-overview').innerHTML = `
  <div class="hero"><h2>Final Proposed Land Use Master Plan 2045</h2>
  <p>A compact <b>radial-concentric satellite town</b> for <b>~80,000 people</b> around a 38.9 ha circular CBD at the R163 × Z1629 junction. <b>Click anything</b> – plot, street, road, zone, facility – for full details.</p></div>
  <div class="cards">
    <div class="card"><div class="v">${fmt(ST.pop_total)}</div><div class="k">design population 2045</div></div>
    <div class="card"><div class="v">1,355.42 ha</div><div class="k">Noapara Union (official boundary)</div></div>
    <div class="card"><div class="v">${fmt(totalPlots)}</div><div class="k">plots (residential, mixed-use, CBD)</div></div>
    <div class="card"><div class="v">${fmt(grp.GREEN, 0)} ha</div><div class="k">urban green (${fmt(grp.GREEN * 1e4 / ST.pop_total)} m² per person)</div></div>
    <div class="card"><div class="v">${fmt(ST.cbd_total, 1)} ha</div><div class="k">circular CBD · 8 themed sectors</div></div>
    <div class="card"><div class="v">${fmt(Object.values(ST.road_km).reduce((a, b) => a + b, 0), 1)} km</div><div class="k">roads · 4-level hierarchy</div></div>
  </div>
  <h2>Land use budget</h2>${bars(Object.entries(grp).sort((a, b) => b[1] - a[1]).map(([g, a]) => [GN[g][0], a, GN[g][1]]), 'ha')}
  <h2>Population by zone</h2>${bars(pops, '')}
  <p class="small">Plots per zone = zone population ÷ persons per plot (4.5 persons per household, Raozan, Census 2022).</p>
  <h2>How to use</h2><ul>
  <li><b>Click</b> any plot, local street, main road, zone, facility or CBD site.</li>
  <li><b>Plots</b>: search a plot ID · <b>Data</b>: every table, searchable, CSV export.</li>
  <li><b>Layers</b>: basemap, transparency of every layer, plot numbers, mouza overlay.</li>
  <li><b>Tools</b> (map, top right): measure distance / area, full screen, reset view, my location.</li></ul>
  <h2>Downloads</h2><p class="small dl"><a href="downloads/sheets/01_Final_Proposed_Land_Use_Master_Plan.pdf">01 Final Proposed Land Use Master Plan</a> · <a href="downloads/sheets/02_Zoning_Plan_Zone_Characteristics.pdf">02 Zoning Plan Zone Characteristics</a> · <a href="downloads/sheets/03_Road_Hierarchy_Connectivity.pdf">03 Road Hierarchy Connectivity</a> · <a href="downloads/sheets/04A_CBD_Functional_Zoning.pdf">04A CBD Functional Zoning</a> · <a href="downloads/sheets/04B_CBD_Detail_Plot_Plan.pdf">04B CBD Detail Plot Plan</a> · <a href="downloads/sheets/04C_CBD_Parking_Transport_Facilities.pdf">04C CBD Parking Transport Facilities</a> · <a href="downloads/sheets/05_Residential_Plots_Katha_Population.pdf">05 Residential Plots Katha Population</a> · <a href="downloads/sheets/06_Plot_Typology_Katha_Details.pdf">06 Plot Typology Katha Details</a> · <a href="downloads/sheets/07_Services_Exact_Locations.pdf">07 Services Exact Locations</a> · <a href="downloads/sheets/08_Catchment_Area_Analysis.pdf">08 Catchment Area Analysis</a> · <a href="downloads/sheets/09_Open_Space_Green_Network.pdf">09 Open Space Green Network</a> · <a href="downloads/sheets/10_Plan_Aligned_with_Mouza.pdf">10 Plan Aligned with Mouza</a> · <a href="downloads/sheets/11_Zone_Map_A_North-West.pdf">11 Zone Map A North-West</a> · <a href="downloads/sheets/12_Zone_Map_B_North-East.pdf">12 Zone Map B North-East</a> · <a href="downloads/sheets/13_Zone_Map_C_South-West.pdf">13 Zone Map C South-West</a> · <a href="downloads/sheets/14_Zone_Map_D_South-East.pdf">14 Zone Map D South-East</a></p><p><b>CAD & data:</b> <a href="downloads/Noapara_Final_Proposed_Master_Plan_2045.dxf">AutoCAD DXF</a> · <a href="downloads/Noapara_Plot_Schedule.csv">Plot schedule (CSV)</a></p>`;
})();

// ZONES
(function () {
  const zf = {}; LYR.zones.eachLayer(l => zf[l.feature.properties.code] = l);
  const order = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'ZK', 'ZW'];
  $('#tab-zones').innerHTML = `<h2>Zoning plan</h2><p>12 zones, each with its own purpose, plot size, height, FAR / MGC and character. Density falls from the CBD outward.</p>` +
    order.map(c => { const p = zf[c].feature.properties; return `<div class="item" data-z="${c}"><div class="t"><span class="sw" style="background:${p.color}"></span>${c} · ${esc(p.name)}</div>
    ${kv([['Area', fmt(p.area_ha, 1) + ' ha'], ['Plot size', p.plot], ['Height', p.height], ['FAR / MGC', p.far_mgc], ['Density', p.density ? p.density + ' persons/ha' : '—']])}<div class="small" style="margin-top:4px">${esc(p.character)}</div></div>`; }).join('');
  $$('#tab-zones .item').forEach(el => el.onclick = () => { const l = zf[el.dataset.z]; map.flyToBounds(l.getBounds(), { padding: [40, 40], duration: .8 }); select(l); infoZone(l.feature.properties, l, l.getBounds().getCenter()); });
})();

// CBD
(function () {
  const SC = {}; D.cbdsectors.features.forEach(f => SC[f.properties.sec] = f.properties);
  const uses = Object.entries(ST.cbd_uses).sort((a, b) => b[1][1] - a[1][1]);
  $('#tab-cbd').innerHTML = `<h2>Circular CBD · ${fmt(ST.cbd_total, 2)} ha</h2>
  <p>Central roundabout & plaza, inner (r 160 m), middle (r 253 m) and CBD ring road (r 340 m, 24 m). The road pattern cuts the circle into <b>8 themed sectors</b>. FAR 4.0 · MGC 65% · up to G+7.</p>
  <h3>Sectors – click to zoom</h3>` + ST.sectors.map(s => `<div class="item" data-s="${s.sec}"><div class="t"><span class="sw" style="background:${SC[s.sec].color}"></span>${s.sec} · ${esc(s.theme)}</div>
    <div class="small">${esc(SC[s.sec].summary)}</div>${kv([['Area', s.area + ' ha'], ['Plots', s.plots + ' (' + s.plot_ha + ' ha)'], ['Open space', s.open_ha + ' ha']])}</div>`).join('') +
  `<h3>Highlight a use</h3><select id="usesel"><option value="">— all uses —</option>${Object.entries(S.cbd_use_names).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
  <h3>Parking</h3>${kv([['Statutory on-site', fmt(ST.cbd_parking_required) + ' spaces (inside each building)'], ['Public gateway car parks', ST.mlcp.length + ' × G+5 = ' + fmt(ST.mlcp_spaces) + ' spaces']])}
  <p class="small">Norms (building rules): shops & restaurants 1 car / ~100 m², offices, banks, hotels 1 / ~200 m², clinic 1 / ~300 m², flats 1 / ~300 m² (2008: 1 per flat).</p>
  <h3>Transport & public facilities</h3>` + Object.entries(S.psym).map(([k, v]) => `<div class="row"><label><input type="checkbox" class="ptog" data-k="${k}" checked><span class="sw" style="background:${v[1]};border-radius:50%"></span>${esc(v[0])} (${ST.cbd_points[k] || 0})</label></div>`).join('') +
  `<h3>Plot schedule by use</h3><table><tr><th>Use</th><th class="n">Plots</th><th class="n">ha</th><th class="n">avg katha</th></tr>${uses.map(([n, v]) => `<tr><td>${esc(n.replace('CBD: ', ''))}</td><td class="n">${v[0]}</td><td class="n">${v[1]}</td><td class="n">${v[2]}</td></tr>`).join('')}</table>`;
  const sl = {}; LYR.cbdsectors.eachLayer(l => sl[l.feature.properties.sec] = l);
  $$('#tab-cbd .item').forEach(el => el.onclick = () => { const l = sl[el.dataset.s], p = l.feature.properties; map.flyToBounds(l.getBounds(), { padding: [30, 30], duration: .8 }); select(l);
    showInfo(`<div class="badge" style="background:${p.color}">${p.sec}</div><h4>${esc(p.theme)}</h4><div class="sub">${esc(p.summary)}</div>${kv([['Sector area', p.area_ha + ' ha'], ['Plots', p.plots + ' · ' + p.plot_ha + ' ha'], ['Open space', p.open_ha + ' ha']])}${sec('Plots by use', `<p class="small">${esc(p.uses)}</p>`)}`); });
  $('#usesel').onchange = e => { const u = e.target.value; LYR.cbdplots.eachLayer(l => l.setStyle({ fillOpacity: !u || l.feature.properties.use === u ? OP.cbdplots : .1 })); };
  $$('.ptog').forEach(cb => cb.onchange = () => { const on = new Set($$('.ptog').filter(x => x.checked).map(x => x.dataset.k)); LYR.cbdpoints.eachLayer(l => { const v = on.has(l.feature.properties.code); l.setStyle({ opacity: v ? 1 : 0, fillOpacity: v ? 1 : 0 }); }); });
})();

// PLOTS
const IDX = {}; LYR.plots.eachLayer(l => IDX[l.feature.properties.id] = l); LYR.cbdplots.eachLayer(l => IDX[l.feature.properties.id] = l);
function gotoPlot(id) { const l = IDX[id]; if (!l) return false; map.flyToBounds(l.getBounds(), { maxZoom: 19, duration: .8 }); select(l);
  const c = l.getBounds().getCenter(); l.feature.properties.use ? infoCBDPlot(l.feature.properties, l, c) : infoPlot(l.feature.properties, l, c); return true; }
(function () {
  $('#tab-plots').innerHTML = `<h2>Find a plot</h2>
  <div class="row"><input type="search" id="psearch" list="pids" placeholder="e.g. HDR-R03-P015 or MDR-B004-P017"><button class="btn" id="pgo">Go</button></div>
  <datalist id="pids">${Object.keys(IDX).map(k => `<option value="${k}">`).join('')}</datalist>
  <p class="small">ID = zone – block – plot. R01–R08 are the concentric ring sectors inside the bypass (wedge-shaped plots); B-blocks are neighbourhood blocks (rectangular plots).</p>
  <h2>Show plot types</h2>${['HDR', 'MDR', 'LDR', 'MXU'].map(z => `<div class="row"><label><input type="checkbox" class="ztog" data-z="${z}" checked><span class="sw" style="background:${TY[z].color}"></span>${ZONENAME[z]} – ${TY[z].katha} katha (${fmt(ST.plots[z])})</label></div>`).join('')}
  <div class="row"><label><input type="checkbox" id="plbl" checked> Show plot number + katha on map (zoom 18.5+)</label></div>
  <h2>Population ÷ persons per plot = plots</h2>
  <table><tr><th>Zone</th><th class="n">Katha</th><th class="n">Pers/plot</th><th class="n">Population</th><th class="n">Plots</th></tr>
  ${ST.res_table.map(r => `<tr><td>${r.zone}</td><td class="n">${r.katha}</td><td class="n">${r.ppp}</td><td class="n">${fmt(r.pop)}</td><td class="n">${fmt(r.plots)}</td></tr>`).join('')}</table>
  <h2>Plot typology (katha details)</h2>
  <table><tr><th>Type</th><th class="n">Katha</th><th>Size ft</th><th class="n">m²</th><th class="n">FAR</th><th class="n">MGC</th><th>Floors</th><th>Setback F/R/S</th></tr>
  ${Object.entries(TY).map(([k, t]) => `<tr><td>${k}</td><td class="n">${t.katha}</td><td>${t.w_ft}×${t.d_ft}</td><td class="n">${fmt(t.katha * KATHA, 0)}</td><td class="n">${t.far}</td><td class="n">${Math.round(t.mgc * 100)}%</td><td>${t.floors}</td><td>${t.setback.join('/')} m</td></tr>`).join('')}</table>
  <p class="small">1 katha = 720 sq ft = 66.89 m² = 1.65 decimal. Setbacks are adopted values – confirm with CDA / local authority.</p>`;
  const go = () => { const v = $('#psearch').value.trim().toUpperCase(); $('#psearch').style.borderColor = gotoPlot(v) ? '' : '#d93025'; };
  $('#pgo').onclick = go; $('#psearch').onkeydown = e => { if (e.key === 'Enter') go(); };
  $$('.ztog').forEach(cb => cb.onchange = () => { const on = new Set($$('.ztog').filter(x => x.checked).map(x => x.dataset.z)); LYR.plots.eachLayer(l => l.setStyle({ fillOpacity: on.has(l.feature.properties.z) ? OP.plots : 0, opacity: on.has(l.feature.properties.z) ? 1 : 0 })); });
  $('#plbl').onchange = e => { showPlotLabels = e.target.checked; updateLabels(); };
})();

// ROADS
(function () {
  const rk = ST.road_km, named = {};
  LYR.roads.eachLayer(l => { const n = l.feature.properties.name; if (n === 'Tertiary Road') return; (named[n] = named[n] || []).push(l); });
  $('#tab-roads').innerHTML = `<h2>Road hierarchy</h2>
  <table><tr><th>Level</th><th class="n">ROW</th><th class="n">km</th><th class="n">km/h</th><th>Examples</th></tr>
  <tr><td><span class="sw" style="background:${RC.ARTERIAL}"></span> Arterial</td><td class="n">30 m</td><td class="n">${rk.ARTERIAL}</td><td class="n">60</td><td>R163 highway, Bypass Ring</td></tr>
  <tr><td><span class="sw" style="background:${RC.COLLECTOR}"></span> Collector</td><td class="n">18–30</td><td class="n">${rk.COLLECTOR}</td><td class="n">40</td><td>CBD Avenue, Z1629, CBD Ring, Links</td></tr>
  <tr><td><span class="sw" style="background:${RC.TERTIARY}"></span> Tertiary</td><td class="n">12 m</td><td class="n">${rk.TERTIARY}</td><td class="n">30</td><td>CBD streets, radials, 400 m grid</td></tr>
  <tr><td><span class="sw" style="background:#fff"></span> Local</td><td class="n">6–9 m</td><td class="n">${rk.LOCAL}</td><td class="n">20</td><td>${D.localroads.features.length} street networks</td></tr></table>
  ${['ARTERIAL', 'COLLECTOR', 'TERTIARY'].map(c => `<div class="row"><label><input type="checkbox" class="rtog" data-c="${c}" checked> Show ${c.toLowerCase()} roads</label></div>`).join('')}
  <div class="row"><label><input type="checkbox" id="ltog" checked> Show local streets</label></div>
  <h2>Connection rules</h2>
  <table class="matrix"><tr><th>From ↓ / to →</th><th>Local</th><th>Tertiary</th><th>Collector</th><th>Arterial</th></tr>
  <tr><td>Local</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✕</td><td class="no">✕</td></tr>
  <tr><td>Tertiary</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓</td><td class="no">✕</td></tr>
  <tr><td>Collector</td><td class="no">✕</td><td class="yes">✓</td><td class="yes">✓</td><td class="yes">✓ rbt</td></tr>
  <tr><td>Arterial</td><td class="no">✕</td><td class="no">✕</td><td class="yes">✓ rbt</td><td class="yes">✓</td></tr></table>
  <p class="small">R163 inside the bypass ring is downgraded to <b>CBD Avenue</b> (collector). Tertiary roads stop 30 m short of arterials; plots never open onto collectors or arterials. ${D.roundabouts.features.length} roundabouts.</p>
  <h2>Named roads – click to locate</h2>` + Object.keys(named).sort().map(n => `<div class="item" data-n="${esc(n)}"><div class="t"><span class="sw" style="background:${RC[named[n][0].feature.properties.cls]}"></span>${esc(n)}</div><div class="small">${named[n][0].feature.properties.cls.toLowerCase()} · ${named[n][0].feature.properties.width} m · ${fmt(named[n].reduce((s, l) => s + l.feature.properties.length_m, 0))} m</div></div>`).join('');
  $$('#tab-roads .item').forEach(el => el.onclick = () => { const ls = named[el.dataset.n], b = L.featureGroup(ls).getBounds(); map.flyToBounds(b, { padding: [40, 40], duration: .8 }); select(ls[0]); infoRoad(ls[0].feature.properties, ls[0], b.getCenter()); });
  const apply = () => { const on = new Set($$('.rtog').filter(x => x.checked).map(x => x.dataset.c));
    [LYR.roads, LYR.roadcasing, LYR.roadcenter].forEach(g => g.eachLayer(l => { if (!on.has(l.feature.properties.cls)) l.setStyle({ opacity: 0 }); }));
    if (on.size === 3) refreshStyles(); else { LYR.roads.eachLayer(l => { if (on.has(l.feature.properties.cls)) l.setStyle({ opacity: OP.roads }); }); } };
  $$('.rtog').forEach(cb => cb.onchange = () => { refreshStyles(); apply(); });
  $('#ltog').onchange = e => e.target.checked ? LYR.localroads.addTo(map) : map.removeLayer(LYR.localroads);
})();

// SERVICES
(function () {
  const CATN = { EDUCATION: 'Education', HEALTH: 'Health', EMERGENCY: 'Fire & police', NCC: 'Neighbourhood centres', RELIGIOUS: 'Religious', TRANSPORT: 'Transport', UTILITY: 'Utilities', PARK: 'Parks & playgrounds' };
  const fl = {}; LYR.facilities.eachLayer(l => fl[l.feature.properties.no] = l);
  const draw = q => { q = (q || '').toLowerCase();
    $('#svc-list').innerHTML = Object.entries(CATN).map(([c, n]) => { const it = D.facilities.features.map(f => f.properties).filter(p => p.cat === c && (!q || p.name.toLowerCase().includes(q)));
      return it.length ? `<h3>${n} (${it.length})</h3>` + it.map(p => `<div class="item" data-no="${p.no}"><div class="t"><span class="sw" style="background:${p.color}"></span>${p.no}. ${esc(p.name)}</div><div class="small">${p.area_ha} ha · ${p.lat}°N ${p.lon}°E · Phase ${p.phase}</div></div>`).join('') : ''; }).join('');
    $$('#svc-list .item').forEach(el => el.onclick = () => { const l = fl[el.dataset.no]; map.flyTo(l.getBounds().getCenter(), 17, { duration: .8 }); select(l); infoFacility(l.feature.properties, l); }); };
  $('#tab-services').innerHTML = `<h2>Services & facilities</h2><p>${D.facilities.features.length} sites with exact coordinates. Selecting one draws its catchment circle.</p><input type="search" id="svc-q" placeholder="Search: school, hospital, college…"><div id="svc-list"></div>`;
  $('#svc-q').oninput = e => draw(e.target.value); draw('');
})();

// CATCHMENT
(function () {
  $('#tab-catch').innerHTML = `<h2>Catchment analysis</h2><p>Population-weighted: every residential plot counts its persons. Choose a service.</p>
  <div class="row"><label><input type="radio" name="cs" value="" checked> None</label></div>` +
    D.catchments.features.map((f, i) => `<div class="item"><label class="row" style="margin:0"><input type="radio" name="cs" value="${i}"> <b>${esc(f.properties.service)}</b></label>
    <div class="bar"><span class="track"><span class="fill" style="width:${f.properties.pct}%;background:#0f9d58"></span></span><span class="num">${f.properties.pct}%</span></div>
    <div class="small">${f.properties.n} facilities · ${fmt(f.properties.pop_out)} persons outside</div></div>`).join('') +
    `<p class="small">Standards: primary 1/5,000 (500 m), high school 1/20,000 (1 km), hospital + CHC (1 km), park 1/10,000 (400 m), market 800 m.</p>`;
  $$('input[name=cs]').forEach(r => r.onchange = () => { LYR.catch.clearLayers(); if (r.value === '') return;
    L.geoJSON(D.catchments.features[+r.value], { pane: 'catch', interactive: false, style: { color: '#0f9d58', weight: 2, fillColor: '#0f9d58', fillOpacity: .18, dashArray: '6 4' } }).addTo(LYR.catch);
    if (!map.hasLayer(LYR.catch)) LYR.catch.addTo(map); map.flyToBounds(LYR.catch.getLayers()[0].getBounds(), { padding: [20, 20], duration: .8 }); });
})();

// LAYERS (visibility + per-layer transparency)
(function () {
  const items = [['landuse', 'Land use (all categories)'], ['zones', 'Zoning (Z1–Z10, ZK, ZW)'], ['plots', 'Residential & mixed-use plots'], ['localroads', 'Local streets'],
    ['cbdplots', 'CBD plots'], ['cbdopen', 'CBD parks & plazas'], ['cbdsectors', 'CBD sector outlines'], ['mlcp', 'CBD car parks'], ['cbdpoints', 'CBD transport & facility points'],
    ['roads', 'Main roads'], ['roundabouts', 'Roundabouts'], ['facilities', 'Services & facilities'], ['khas', 'Khas land'], ['water', 'Waterbodies'], ['river', 'River']];
  $('#tab-layers').innerHTML = `<h2>Basemap</h2>${Object.entries(BASE).map(([k, v]) => `<div class="row"><label><input type="radio" name="bm" value="${k}" ${k === 'light' ? 'checked' : ''}> ${v.name}</label></div>`).join('')}
  <div class="srow"><span>Basemap opacity</span><input type="range" min="0" max="100" value="100" id="bmop"><output>100%</output></div>
  <p class="small">Google’s own tiles can’t be embedded on a free site; use Esri satellite here and the “Google Maps” links in every detail card.</p>
  <h2>Whole plan transparency</h2><div class="srow"><span>All plan layers</span><input type="range" min="0" max="100" value="100" id="allop"><output>100%</output></div>
  <div class="row"><button class="btn ghost sm" data-preset="100">High (solid)</button><button class="btn ghost sm" data-preset="60">Medium</button><button class="btn ghost sm" data-preset="30">Low (see-through)</button></div>
  <h2>Layers – visibility & transparency</h2>` + items.map(([k, n]) => `<div class="lrow"><label><input type="checkbox" class="ltog" id="lt-${k}" data-k="${k}" ${map.hasLayer(LYR[k]) ? 'checked' : ''}> ${n}</label>
    <div class="srow"><input type="range" min="0" max="100" value="${Math.round(OP[k] * 100)}" class="lop" data-k="${k}"><output>${Math.round(OP[k] * 100)}%</output></div></div>`).join('') +
  `<h2>Mouza sheet overlay</h2><div class="row"><label><input type="checkbox" id="mz"> Georeferenced mouza / cadastral sheet</label></div>
  <div class="srow"><span>Opacity</span><input type="range" min="0" max="100" value="60" id="mzop"><output>60%</output></div>
  <h2>Labels</h2><div class="row"><label><input type="checkbox" id="flbl" checked> Facility names (zoom 16+)</label></div>`;
  const BASEOP = { v: 1 };
  $$('input[name=bm]').forEach(r => r.onchange = () => { map.removeLayer(BASE[curBase].layer); curBase = r.value; BASE[curBase].layer.addTo(map); setBaseOpacity(BASEOP.v); });
  const out = el => el.nextElementSibling && (el.nextElementSibling.value = el.value + '%');
  $('#bmop').oninput = e => { BASEOP.v = e.target.value / 100; setBaseOpacity(BASEOP.v); out(e.target); };
  const DEF = Object.assign({}, OP);
  function applyOP(k) {
    const o = OP[k], g = LYR[k];
    if (k === 'roads') { refreshStyles(); return; }
    if (k === 'cbdpoints') { g.eachLayer(l => l.setStyle({ opacity: o, fillOpacity: o })); return; }
    if (k === 'cbdsectors') { g.setStyle({ opacity: o }); return; }
    g.eachLayer(l => l.setStyle({ fillOpacity: o, opacity: Math.min(1, o + .1) }));
  }
  $$('.lop').forEach(s => s.oninput = () => { OP[s.dataset.k] = s.value / 100; applyOP(s.dataset.k); out(s); });
  const setAll = v => { Object.keys(DEF).forEach(k => { if (!LYR[k]) return; OP[k] = DEF[k] * v; applyOP(k); const s = $(`.lop[data-k=${k}]`); if (s) { s.value = Math.round(OP[k] * 100); out(s); } }); $('#allop').value = Math.round(v * 100); out($('#allop')); };
  $('#allop').oninput = e => setAll(e.target.value / 100);
  $$('[data-preset]').forEach(b => b.onclick = () => setAll(b.dataset.preset / 100));
  $('#mz').onchange = e => e.target.checked ? mouza.addTo(map) : map.removeLayer(mouza);
  $('#mzop').oninput = e => { mouza.setOpacity(e.target.value / 100); out(e.target); };
  $$('.ltog').forEach(cb => cb.onchange = () => { const k = cb.dataset.k, l = LYR[k]; cb.checked ? l.addTo(map) : map.removeLayer(l);
    if (k === 'roads') [LYR.roadcasing, LYR.roadcenter].forEach(x => cb.checked ? x.addTo(map) : map.removeLayer(x)); updateLabels(); });
  $('#flbl').onchange = e => map.getContainer().classList.toggle('no-fac', !e.target.checked);
})();

// DATA TABLES
(function () {
  const sets = {
    blocks: { name: 'Residential blocks', cols: ['block', 'zone', 'plots', 'katha', 'pop', 'ha'], head: ['Block', 'Zone', 'Plots', 'Avg katha', 'Population', 'Net ha'], rows: S.blocks,
      go: r => { const ls = []; LYR.plots.eachLayer(l => { if (l.feature.properties.b === r.block) ls.push(l); }); if (ls.length) { const fg = L.featureGroup(ls); map.flyToBounds(fg.getBounds(), { padding: [30, 30], duration: .8 }); } } },
    plots: { name: 'All plots', cols: ['id', 'z', 'b', 'katha', 'm2'], head: ['Plot', 'Zone', 'Block', 'Katha', 'm²'],
      rows: D.plots.features.map(f => ({ id: f.properties.id, z: f.properties.z, b: f.properties.b, katha: +(f.properties.a / KATHA).toFixed(2), m2: f.properties.a }))
        .concat(D.cbdplots.features.map(f => ({ id: f.properties.id, z: 'CBD-' + f.properties.use, b: f.properties.sec, katha: +(f.properties.a / KATHA).toFixed(2), m2: f.properties.a }))), go: r => gotoPlot(r.id) },
    landuse: { name: 'Land use budget', cols: ['0', '1', '2'], head: ['Land use', 'Group', 'Area ha'], rows: ST.part.map(p => ({ 0: p[0], 1: p[1], 2: p[2] })) },
    zones: { name: 'Zones', cols: ['0', '1', '2'], head: ['Code', 'Zone', 'Area ha'], rows: ST.zones.map(z => ({ 0: z[0], 1: z[1], 2: z[2] })) },
    roads: { name: 'Main road segments', cols: ['id', 'name', 'cls', 'width', 'length_m'], head: ['ID', 'Road', 'Class', 'ROW m', 'Length m'], rows: D.roads.features.map(f => f.properties),
      go: r => { LYR.roads.eachLayer(l => { if (l.feature.properties.id === r.id) { map.flyToBounds(l.getBounds(), { padding: [40, 40] }); select(l); infoRoad(l.feature.properties, l, l.getBounds().getCenter()); } }); } },
    local: { name: 'Local street networks', cols: ['id', 'type', 'width', 'length_m', 'plots'], head: ['ID', 'Type', 'Width', 'Length m', 'Plots'], rows: D.localroads.features.map(f => f.properties),
      go: r => { LYR.localroads.eachLayer(l => { if (l.feature.properties.id === r.id) { map.flyToBounds(l.getBounds(), { padding: [40, 40] }); select(l); infoLocal(l.feature.properties, l, l.getBounds().getCenter()); } }); } },
    facilities: { name: 'Facilities', cols: ['no', 'name', 'cat', 'area_ha', 'lat', 'lon'], head: ['No', 'Name', 'Category', 'ha', 'Lat', 'Long'], rows: D.facilities.features.map(f => f.properties),
      go: r => { LYR.facilities.eachLayer(l => { if (l.feature.properties.no === r.no) { map.flyTo(l.getBounds().getCenter(), 17); select(l); infoFacility(l.feature.properties, l); } }); } },
    parking: { name: 'CBD parking demand', cols: ['0', '1', '2'], head: ['Use', 'GFA ha', 'Car spaces'], rows: Object.entries(ST.cbd_parking_demand).map(([k, v]) => ({ 0: k, 1: v[0], 2: v[1] })) } };
  $('#tab-data').innerHTML = `<h2>Data tables</h2><div class="row"><select id="dset">${Object.entries(sets).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></div>
  <div class="row"><input type="search" id="dq" placeholder="Filter rows…"><button class="btn ghost" id="dcsv">CSV</button></div><div id="dcount" class="small"></div><div class="tablewrap" id="dtab"></div>`;
  let cur = 'blocks', sortK = null, sortD = 1;
  function render() {
    const s = sets[cur], q = $('#dq').value.toLowerCase();
    let rows = s.rows.filter(r => !q || s.cols.some(c => String(r[c]).toLowerCase().includes(q)));
    if (sortK !== null) rows = rows.slice().sort((a, b) => (a[sortK] > b[sortK] ? 1 : a[sortK] < b[sortK] ? -1 : 0) * sortD);
    $('#dcount').textContent = `${rows.length} of ${s.rows.length} rows${s.go ? ' · click a row to locate it' : ''}`;
    $('#dtab').innerHTML = `<table><tr>${s.head.map((h, i) => `<th data-k="${s.cols[i]}" class="${typeof s.rows[0][s.cols[i]] === 'number' ? 'n' : ''}">${h}${sortK === s.cols[i] ? (sortD > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>` +
      rows.slice(0, 600).map((r, i) => `<tr data-i="${s.rows.indexOf(r)}" class="${s.go ? 'click' : ''}">${s.cols.map(c => `<td class="${typeof r[c] === 'number' ? 'n' : ''}">${typeof r[c] === 'number' ? fmt(r[c], r[c] % 1 ? 2 : 0) : esc(r[c])}</td>`).join('')}</tr>`).join('') + '</table>' + (rows.length > 600 ? '<p class="small">Showing first 600 – filter to narrow.</p>' : '');
    $$('#dtab th').forEach(th => th.onclick = () => { sortD = sortK === th.dataset.k ? -sortD : 1; sortK = th.dataset.k; render(); });
    if (s.go) $$('#dtab tr.click').forEach(tr => tr.onclick = () => s.go(s.rows[+tr.dataset.i]));
  }
  $('#dset').onchange = e => { cur = e.target.value; sortK = null; render(); };
  $('#dq').oninput = render;
  $('#dcsv').onclick = () => { const s = sets[cur]; const csv = [s.head.join(',')].concat(s.rows.map(r => s.cols.map(c => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `noapara_${cur}.csv`; a.click(); };
  render();
})();

// ABOUT
$('#tab-about').innerHTML = `<h2>About this plan</h2>
<p>Final Proposed Land Use Master Plan 2045 for the <b>Noapara Satellite Growth Centre</b>, Noapara Union, Raozan Upazila, Chattogram. Horizon 2026–2045 in three phases (51,300 → 68,990 → 80,000 people).</p>
<h3>Concept</h3><ul>
<li>Circular CBD (r 352 m, 38.9 ha) at the existing bazar junction, 8 themed sectors, central plaza and park.</li>
<li>30 m bypass ring (r 700 m) for through traffic; R163 inside becomes CBD Avenue.</li>
<li>Concentric HDR/MDR rings inside the bypass with a park in every sector.</li>
<li>Outside: neighbourhood blocks with double-loaded local streets, green back-garden strips and a central park – plots spread evenly, no congested clusters.</li>
<li>Strict road hierarchy; plots only on local streets or service lanes.</li>
<li>Agricultural & char belt, riverfront park, khas land and ponds protected.</li></ul>
<h3>Data & standards</h3><ul>
<li>Union boundary: BBS / geoBoundaries ADM4 (1,355.42 ha), WGS 84 / UTM 46N.</li>
<li>Population 2022: 40,472 (BBS); household size 4.5 (Raozan, Census 2022).</li>
<li>Parking: Building Construction Rules 1996 & 2008 (Bangladesh).</li>
<li>FAR / MGC / heights: design report Sec. 4.8–4.9; setbacks adopted, to be confirmed with CDA.</li></ul>
<p class="small">Planning layout for academic / review use – confirm plot dimensions by cadastral (mouza/dag) survey. Verify the existing Noapara Degree College location on site.</p>
<p class="small">Built with Leaflet · © OpenStreetMap, © CARTO, imagery © Esri.</p>`;

// ================================================================== TOOLS (measure, fullscreen, reset, locate)
const measure = { on: false, pts: [], layer: L.layerGroup().addTo(map),
  add(ll) { this.pts.push(ll); this.draw(); },
  draw() { this.layer.clearLayers(); if (!this.pts.length) return;
    this.pts.forEach(p => L.circleMarker(p, { radius: 4, color: '#d81b60', fillColor: '#fff', fillOpacity: 1, weight: 2, pane: 'sel' }).addTo(this.layer));
    if (this.pts.length > 1) L.polyline(this.pts, { color: '#d81b60', weight: 3, dashArray: '6 5', pane: 'sel' }).addTo(this.layer);
    if (this.pts.length > 2) L.polygon(this.pts, { color: '#d81b60', weight: 1, fillOpacity: .12, pane: 'sel' }).addTo(this.layer);
    let d = 0; for (let i = 1; i < this.pts.length; i++) d += map.distance(this.pts[i - 1], this.pts[i]);
    let a = 0; if (this.pts.length > 2) { const xy = ringXY(this.pts); for (let i = 0; i < xy.length; i++) { const j = (i + 1) % xy.length; a += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1]; } a = Math.abs(a / 2); }
    $('#mres').innerHTML = `Distance <b>${d >= 1000 ? fmt(d / 1000, 2) + ' km' : fmt(d, 1) + ' m'}</b>${a ? ` · Area <b>${fmt(a, 0)} m²</b> = ${fmt(a / KATHA, 1)} katha = ${fmt(a / 1e4, 3)} ha` : ''}`; } };
const Tools = L.Control.extend({ options: { position: 'topright' }, onAdd() {
  const d = L.DomUtil.create('div', 'leaflet-bar tools');
  d.innerHTML = `<a href="#" title="Measure distance / area" id="t-measure">📏</a><a href="#" title="Full screen" id="t-fs">⛶</a><a href="#" title="Reset view" id="t-home">⌂</a><a href="#" title="My location" id="t-loc">◎</a><a href="#" title="Print" id="t-print">⎙</a>`;
  L.DomEvent.disableClickPropagation(d); return d; } });
map.addControl(new Tools());
const mbox = L.DomUtil.create('div', 'glass mbox hidden', $('#mapwrap')); mbox.innerHTML = `<b>Measure</b> – click points on the map<div id="mres" class="small">Distance 0 m</div><div class="row"><button class="btn ghost sm" id="mclr">Clear</button><button class="btn sm" id="mend">Done</button></div>`;
const stop = e => { e.preventDefault(); };
window.__measureAdd = ll => measure.add(ll);
Object.defineProperty(window, '__measureOn', { get: () => measure.on });
$('#t-measure').onclick = e => { stop(e); measure.on = !measure.on; mbox.classList.toggle('hidden', !measure.on); map.getContainer().style.cursor = measure.on ? 'crosshair' : ''; if (!measure.on) { measure.pts = []; measure.draw(); measure.layer.clearLayers(); } };
$('#mclr').onclick = () => { measure.pts = []; measure.layer.clearLayers(); $('#mres').textContent = 'Distance 0 m'; };
$('#mend').onclick = () => { measure.on = false; mbox.classList.add('hidden'); map.getContainer().style.cursor = ''; };
$('#t-fs').onclick = e => { stop(e); try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (x) {} };
$('#t-home').onclick = e => { stop(e); map.flyToBounds(LYR.boundary.getBounds(), { padding: [20, 20] }); };
$('#t-loc').onclick = e => { stop(e); map.locate({ setView: true, maxZoom: 17 }); };
map.on('locationfound', e => L.circleMarker(e.latlng, { radius: 8, color: '#1f6feb', fillColor: '#1f6feb', fillOpacity: .6, pane: 'sel' }).addTo(temp));
$('#t-print').onclick = e => { stop(e); window.print(); };

// ================================================================== LEGEND
function renderLegend(tab) {
  const lu = [['CBD commercial', '#c2185b'], ['HDR 5 katha', TY.HDR.color], ['MDR 3 katha', TY.MDR.color], ['LDR 2.5 katha', TY.LDR.color], ['Mixed-use corridor', TY.MXU.color],
    ['Education', '#3f6fb5'], ['Health', '#e15759'], ['Parks & green', '#3d9b45'], ['Green strips / buffers', '#cfe8bd'], ['Agriculture', '#eef2cf'], ['Char agriculture', '#d6cf96'],
    ['Khas land', '#f4b9cb'], ['Water', '#3a8fd6'], ['Industrial', '#a58fd0']];
  let h = '<div class="lhead"><b>Legend</b><button class="icon-btn sm" id="lgx">–</button></div><div id="lgbody">';
  if (tab === 'zones') h += D.zones.features.map(f => `<div class="lg"><span class="sw" style="background:${f.properties.color}"></span>${f.properties.code} ${esc(f.properties.name)}</div>`).join('');
  else if (tab === 'cbd') h += Object.entries(S.cbd_use_names).map(([k, v]) => `<div class="lg"><span class="sw" style="background:${S.cbd_cols[k]}"></span>${esc(v)}</div>`).join('');
  else h += lu.map(([n, c]) => `<div class="lg"><span class="sw" style="background:${c}"></span>${n}</div>`).join('');
  h += `<div class="lg"><span class="ln" style="border-color:${RC.ARTERIAL}"></span>Arterial 30 m</div><div class="lg"><span class="ln" style="border-color:${RC.COLLECTOR}"></span>Collector 18–30 m</div><div class="lg"><span class="ln" style="border-color:${RC.TERTIARY}"></span>Tertiary 12 m</div><div class="lg"><span class="sw" style="background:#fff"></span>Local street 6–9 m</div></div>`;
  $('#legend').innerHTML = h; $('#lgx').onclick = () => $('#legend').classList.toggle('min');
}
renderLegend('overview');
refreshStyles();

// deep links
const m = location.hash.match(/^#([\d.]+)\/([\d.-]+)\/([\d.-]+)/); if (m) map.setView([+m[2], +m[3]], +m[1]);
const qp = new URLSearchParams(location.search).get('plot');
if (qp) { document.querySelector('[data-tab=plots]').click(); $('#psearch').value = qp; setTimeout(() => gotoPlot(qp.toUpperCase()), 300); }
window.__plotIndex = IDX;
})();
