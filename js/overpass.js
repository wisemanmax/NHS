// Live OpenStreetMap lookups from the phone, for places the morning list doesn't cover.
import { OVERPASS_ENDPOINTS, buildBboxQuery, dedupeStores, normalizeElement } from './osm.js';

function timeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** Fashion shops inside [south, west, north, east]. Tries each public Overpass server in turn. */
export async function fetchShopsInBox(bbox) {
  const body = new URLSearchParams({ data: buildBboxQuery(bbox) });
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { method: 'POST', body, signal: timeoutSignal(25000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return dedupeStores(json.elements.map(normalizeElement).filter(Boolean));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('OpenStreetMap search failed');
}

/** A box roughly `radiusM` meters around a point, for the "around me" search. */
export function boxAround([lat, lon], radiusM = 900) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}
