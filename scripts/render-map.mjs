// Renders the s04 plate (Red Sea, Suez, Hormuz) from Natural Earth 1:10m data (public domain)
// with the deck's projection, so later highlights line up: node scripts/render-map.mjs
// Input: assets-src/geo/ne_10m_land.geojson, ne_10m_admin_0_boundary_lines_land.geojson
// (from github.com/nvkelso/natural-earth-vector). Output: public/plates/s04.jpg (1920×1080).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { project, MAP_VIEW, LAT_MIN, LAT_MAX } from '../src/core/geo.js';

const GEO = 'assets-src/geo';
const M = 10; // degrees of margin around the frame
const inView = ([lon, lat]) => lon > MAP_VIEW.lonMin - M && lon < MAP_VIEW.lonMax + M && lat > LAT_MIN - M && lat < LAT_MAX + M;

// GeoJSON → arrays of projected rings [x0, y0, x1, y1, ...], only the ones touching the frame.
function rings(file) {
  const out = [];
  for (const f of JSON.parse(readFileSync(`${GEO}/${file}`, 'utf8')).features) {
    const g = f.geometry;
    const lines = g.type === 'Polygon' || g.type === 'MultiLineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [g.coordinates];
    for (const line of lines) if (line.some(inView)) out.push(line.flatMap(([lon, lat]) => project(lon, lat)));
  }
  return out;
}

const land = rings('ne_10m_land.geojson');
const borders = rings('ne_10m_admin_0_boundary_lines_land.geojson');
const graticule = [];
for (let lon = 15; lon <= 65; lon += 5) graticule.push([...project(lon, LAT_MAX), ...project(lon, LAT_MIN)]);
for (let lat = 10; lat <= 35; lat += 5) graticule.push([...project(MAP_VIEW.lonMin, lat), ...project(MAP_VIEW.lonMax, lat)]);
console.log(`land rings ${land.length}, border lines ${borders.length}`);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setContent('<canvas width="1920" height="1080"></canvas>');
const dataUrl = await page.evaluate(
  ({ land, borders, graticule }) => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const path = (r) => {
      g.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) g.lineTo(r[i], r[i + 1]);
    };
    // sea
    const sea = g.createRadialGradient(1250, 520, 100, 1250, 520, 1300);
    sea.addColorStop(0, '#0d2747');
    sea.addColorStop(1, '#060d14');
    g.fillStyle = sea;
    g.fillRect(0, 0, 1920, 1080);
    // graticule
    g.strokeStyle = 'rgba(0, 240, 255, 0.07)';
    g.lineWidth = 1;
    g.beginPath();
    graticule.forEach(path);
    g.stroke();
    // land with a soft cyan coastline glow
    g.beginPath();
    land.forEach((r) => (path(r), g.closePath()));
    const ground = g.createLinearGradient(0, 0, 1920, 1080);
    ground.addColorStop(0, '#1a2633');
    ground.addColorStop(1, '#141e29');
    g.fillStyle = ground;
    g.fill('evenodd');
    g.save();
    g.shadowColor = 'rgba(0, 240, 255, 0.55)';
    g.shadowBlur = 14;
    g.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(150, 225, 240, 0.7)';
    g.lineWidth = 1.1;
    g.stroke();
    // country borders
    g.beginPath();
    borders.forEach(path);
    g.strokeStyle = 'rgba(232, 238, 244, 0.14)';
    g.lineWidth = 1;
    g.stroke();
    // darker left third for the HUD, then a vignette
    const left = g.createLinearGradient(0, 0, 900, 0);
    left.addColorStop(0, 'rgba(10, 17, 24, 0.55)');
    left.addColorStop(1, 'rgba(10, 17, 24, 0)');
    g.fillStyle = left;
    g.fillRect(0, 0, 1920, 1080);
    const vig = g.createRadialGradient(960, 540, 500, 960, 540, 1150);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, 1920, 1080);
    return c.toDataURL('image/jpeg', 0.9);
  },
  { land, borders, graticule }
);
await browser.close();
writeFileSync('public/plates/s04.jpg', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote public/plates/s04.jpg');
