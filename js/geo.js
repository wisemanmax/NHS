// Geometry helpers. Coordinates are [lat, lon] pairs throughout.

const EARTH_RADIUS_M = 6371008.8;
export const METERS_PER_MILE = 1609.344;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle ("straight-line") distance in meters. */
export function distanceMeters(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0.3 mi" style label. Callers add "about … away" where it reads better. */
export function formatMiles(meters) {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return 'under 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** Extra straight-line distance for going origin → via → dest instead of origin → dest. */
export function detourMeters(origin, via, dest) {
  return distanceMeters(origin, via) + distanceMeters(via, dest) - distanceMeters(origin, dest);
}

/** Ray-casting point-in-polygon test. polygon: [[lat, lon], ...] (open or closed ring). */
export function pointInPolygon([lat, lon], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** [south, west, north, east] bounding box of a polygon. */
export function bboxOf(polygon) {
  const lats = polygon.map((p) => p[0]);
  const lons = polygon.map((p) => p[1]);
  return [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)];
}
