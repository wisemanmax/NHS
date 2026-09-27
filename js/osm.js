// OpenStreetMap / Overpass helpers shared by the app (live "search this area")
// and scripts/build-stores.mjs (the morning run that writes data/stores.json).

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Shop types that sell clothes, shoes or fashion accessories.
export const SHOP_VALUES = [
  'clothes',
  'shoes',
  'boutique',
  'fashion',
  'fashion_accessories',
  'bag',
  'leather',
  'department_store',
  'second_hand',
  'sports',
];
const SHOP_FILTER = `["shop"~"^(${SHOP_VALUES.join('|')})$"]`;

const polyFilter = (polygon) => `poly:"${polygon.map(([lat, lon]) => `${lat} ${lon}`).join(' ')}"`;

export function buildAreaQuery(areas, timeout = 120) {
  const parts = areas.map((a) => `  nwr${SHOP_FILTER}(${polyFilter(a.polygon)});`).join('\n');
  return `[out:json][timeout:${timeout}];\n(\n${parts}\n);\nout center tags qt;`;
}

export function buildBboxQuery([south, west, north, east], timeout = 25) {
  const box = [south, west, north, east].map((n) => n.toFixed(5)).join(',');
  return `[out:json][timeout:${timeout}];\nnwr${SHOP_FILTER}(${box});\nout center tags qt;`;
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

function normalizeUrl(url) {
  if (!url) return null;
  const trimmed = url.split(';')[0].trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Overpass element → compact store record, or null if it isn't a usable fashion shop. */
export function normalizeElement(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const shop = t.shop;
  if (!SHOP_VALUES.includes(shop)) return null;
  const name = (t.name || t.brand || '').trim();
  if (!name) return null;
  // Sporting-goods shops only count when they're tagged as selling clothes or are a known brand.
  if (shop === 'sports' && !t.clothes && !t.brand) return null;

  const store = { id: `${el.type[0]}${el.id}`, name, lat: round5(lat), lon: round5(lon), shop };
  const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const optional = {
    brand: t.brand,
    wd: t['brand:wikidata'],
    addr: addr || null,
    hours: t.opening_hours,
    phone: t.phone || t['contact:phone'],
    web: normalizeUrl(t.website || t['contact:website'] || t.url),
    clothes: t.clothes,
    sh: t.second_hand,
  };
  for (const [k, v] of Object.entries(optional)) if (v) store[k] = v;
  return store;
}

const fieldCount = (s) => Object.keys(s).length;
const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The same shop is sometimes mapped twice (a point and a building outline).
 * Keep the richer record when two shops share a name and sit within ~40 m.
 */
export function dedupeStores(stores) {
  const kept = [];
  const byName = new Map();
  for (const s of stores) {
    const key = normName(s.name);
    const twins = byName.get(key) || [];
    const twin = twins.find((k) => Math.abs(k.lat - s.lat) < 0.00036 && Math.abs(k.lon - s.lon) < 0.00048);
    if (!twin) {
      kept.push(s);
      twins.push(s);
      byName.set(key, twins);
    } else if (fieldCount(s) > fieldCount(twin)) {
      kept[kept.indexOf(twin)] = s;
      twins[twins.indexOf(twin)] = s;
    }
  }
  return kept;
}

const ORDINALS = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th', eleventh: '11th', twelfth: '12th' };
const STREET_WORDS = { avenue: 'ave', av: 'ave', street: 'st', west: 'w', east: 'e', north: 'n', south: 's', boulevard: 'blvd', place: 'pl', broadway: 'broadway' };

/** "260 Fifth Avenue, New York, NY 10001" and "260 5th Avenue" → "260 5th ave". */
export function addressKey(address) {
  return String(address || '')
    .split(',')[0]
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ORDINALS[w] || STREET_WORDS[w] || w)
    .join(' ');
}
