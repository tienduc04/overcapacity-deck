// Map frame of the s04 plate (public/plates/s04.jpg, rendered by scripts/render-map.mjs).
// Equirectangular with cos(lat0) correction; the plate and any HUD highlight share project(),
// so a highlight drawn at project(lon, lat) sits exactly on the plate's coastline.

export const MAP_VIEW = { lonMin: 12, lonMax: 68, latCenter: 22, width: 1920, height: 1080 };

const pxPerLon = MAP_VIEW.width / (MAP_VIEW.lonMax - MAP_VIEW.lonMin);
const pxPerLat = pxPerLon / Math.cos((MAP_VIEW.latCenter * Math.PI) / 180);
export const LAT_MAX = MAP_VIEW.latCenter + MAP_VIEW.height / 2 / pxPerLat;
export const LAT_MIN = MAP_VIEW.latCenter - MAP_VIEW.height / 2 / pxPerLat;

// lon/lat in degrees → stage pixels (1920×1080, origin top-left)
export const project = (lon, lat) => [(lon - MAP_VIEW.lonMin) * pxPerLon, (LAT_MAX - lat) * pxPerLat];

// Approximate centres, for highlight markers (not for navigation).
export const CHOKEPOINTS = {
  suez: { name: 'Suez Canal', lon: 32.55, lat: 30.6 },
  babElMandeb: { name: 'Bab el-Mandeb', lon: 43.4, lat: 12.6 },
  hormuz: { name: 'Strait of Hormuz', lon: 56.4, lat: 26.5 },
};
