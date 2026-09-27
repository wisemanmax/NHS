import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaQuery, buildBboxQuery, dedupeStores, normalizeElement } from '../js/osm.js';

test('normalizes a tagged node', () => {
  const s = normalizeElement({
    type: 'node',
    id: 42,
    lat: 40.7243219,
    lon: -73.9977001,
    tags: {
      shop: 'clothes',
      name: 'Uniqlo',
      brand: 'Uniqlo',
      'brand:wikidata': 'Q26070',
      'addr:housenumber': '546',
      'addr:street': 'Broadway',
      opening_hours: 'Mo-Sa 10:00-21:00',
      website: 'www.uniqlo.com',
    },
  });
  assert.deepEqual(s, {
    id: 'n42',
    name: 'Uniqlo',
    lat: 40.72432,
    lon: -73.9977,
    shop: 'clothes',
    brand: 'Uniqlo',
    wd: 'Q26070',
    addr: '546 Broadway',
    hours: 'Mo-Sa 10:00-21:00',
    web: 'https://www.uniqlo.com',
  });
});

test('ways use their center; unusable elements are dropped', () => {
  const way = normalizeElement({ type: 'way', id: 7, center: { lat: 40.7, lon: -74 }, tags: { shop: 'shoes', name: 'Shoe Box' } });
  assert.equal(way.id, 'w7');
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 1, tags: { shop: 'clothes' } }), null);
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 1, tags: { shop: 'jewelry', name: 'Gems' } }), null);
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 1, tags: { shop: 'sports', name: 'Bikes' } }), null);
  assert.ok(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 1, tags: { shop: 'sports', name: 'Nike', brand: 'Nike' } }));
});

test('queries', () => {
  const q = buildAreaQuery([{ polygon: [[40.1, -73.9], [40.2, -73.9], [40.2, -73.8]] }]);
  assert.match(q, /poly:"40\.1 -73\.9 40\.2 -73\.9 40\.2 -73\.8"/);
  assert.match(q, /out center tags qt;$/);
  assert.match(buildBboxQuery([40.7, -74.01, 40.73, -73.99]), /\(40\.70000,-74\.01000,40\.73000,-73\.99000\)/);
});

test('dedupe keeps the richer twin and leaves distinct shops alone', () => {
  const stores = [
    { id: 'n1', name: 'Zara', lat: 40.72, lon: -74.0, shop: 'clothes' },
    { id: 'w2', name: 'ZARA', lat: 40.7201, lon: -74.0001, shop: 'clothes', addr: '503 Broadway', hours: 'Mo-Su 10:00-21:00' },
    { id: 'n3', name: 'Zara', lat: 40.75, lon: -73.98, shop: 'clothes' },
  ];
  assert.deepEqual(dedupeStores(stores).map((s) => s.id), ['w2', 'n3']);
});
