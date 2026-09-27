#!/usr/bin/env node
// Morning run: list every fashion shop OpenStreetMap knows inside data/areas.json and write
// data/stores.json, then geocode any event addresses in data/events.json that lack coordinates.
// Runs daily in GitHub Actions (.github/workflows/refresh-stores.yml); also fine locally.
import { readFile, writeFile } from 'node:fs/promises';
import { OVERPASS_ENDPOINTS, buildAreaQuery, dedupeStores, normalizeElement } from '../js/osm.js';
import { pointInPolygon } from '../js/geo.js';

const USER_AGENT = 'next-stop-nyc/1.0 (+https://github.com/wisemanmax/NHS)';
const MIN_STORES = Number(process.env.MIN_STORES || 100);
const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round5 = (n) => Math.round(n * 1e5) / 1e5;

async function overpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(180_000),
        });
        if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
        const json = await res.json();
        if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(`${endpoint}: ${json.remark}`);
        return json;
      } catch (err) {
        lastError = err;
        console.warn(String(err));
      }
    }
    await sleep(15_000 * (attempt + 1));
  }
  throw lastError;
}

async function geocode(address) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' +
    encodeURIComponent(address);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`);
  const [hit] = await res.json();
  return hit ? [round5(Number(hit.lat)), round5(Number(hit.lon))] : null;
}

async function buildStores() {
  const { areas } = await readJson('data/areas.json');
  const json = await overpass(buildAreaQuery(areas));

  const stores = [];
  for (const el of json.elements) {
    const store = normalizeElement(el);
    if (!store) continue;
    const area = areas.find((a) => pointInPolygon([store.lat, store.lon], a.polygon));
    if (!area) continue;
    store.area = area.id;
    stores.push(store);
  }
  const unique = dedupeStores(stores).sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));

  // Refuse to replace good data with a truncated Overpass response.
  const previous = await readJson('data/stores.json').catch(() => null);
  const floor = Math.max(MIN_STORES, Math.floor((previous?.stores?.length || 0) * 0.6));
  if (unique.length < floor) throw new Error(`Only ${unique.length} stores (expected at least ${floor}); keeping the old file.`);

  const counts = Object.fromEntries(areas.map((a) => [a.id, 0]));
  for (const s of unique) counts[s.area]++;
  const header = {
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap via the Overpass API',
    license: 'ODbL 1.0, © OpenStreetMap contributors',
    osmDataAsOf: json.osm3s?.timestamp_osm_base ?? null,
    counts,
  };
  // One store per line keeps the daily diff readable.
  const lines = unique.map((s) => `    ${JSON.stringify(s)}`).join(',\n');
  const text = JSON.stringify({ ...header, stores: [] }, null, 2).replace('"stores": []', `"stores": [\n${lines}\n  ]`);
  await writeFile(new URL('data/stores.json', root), `${text}\n`);
  console.log(`Wrote ${unique.length} stores`, counts);
}

async function geocodeEvents() {
  const doc = await readJson('data/events.json');
  let changed = 0;
  for (const ev of doc.events) {
    if (!ev.address || (ev.lat != null && ev.lon != null)) continue;
    await sleep(1100); // Nominatim usage policy: at most one request per second
    try {
      const hit = await geocode(ev.address);
      if (hit) {
        [ev.lat, ev.lon] = hit;
        changed++;
      } else {
        console.warn(`No geocode result for ${ev.address}`);
      }
    } catch (err) {
      console.warn(String(err));
    }
  }
  if (changed) {
    await writeFile(new URL('data/events.json', root), `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`Geocoded ${changed} event address(es)`);
  }
}

await buildStores();
await geocodeEvents();
