// The trust rules from the plan, enforced on the data files: every offer and event
// carries a source link, a check time and an explicit in-store status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pointInPolygon } from '../js/geo.js';

const load = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const inNyc = (lat, lon) => lat > 40.45 && lat < 40.95 && lon > -74.3 && lon < -73.65;
const isDay = (d) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);
const isIso = (t) => typeof t === 'string' && !Number.isNaN(Date.parse(t));

const areas = load('data/areas.json').areas;
const brandsDoc = load('data/brands.json');
const brandIds = new Set(brandsDoc.brands.map((b) => b.id));

test('areas are sane polygons around their centers', () => {
  const ids = new Set();
  for (const a of areas) {
    assert.ok(!ids.has(a.id), `duplicate area ${a.id}`);
    ids.add(a.id);
    assert.ok(a.polygon.length >= 3);
    for (const [lat, lon] of a.polygon) assert.ok(inNyc(lat, lon), `${a.id} vertex outside NYC`);
    assert.ok(pointInPolygon(a.center, a.polygon), `${a.id} center outside its polygon`);
  }
});

test('brand notes are well-formed', () => {
  assert.equal(brandIds.size, brandsDoc.brands.length, 'duplicate brand ids');
  const styles = new Set(Object.keys(brandsDoc.styles));
  for (const b of brandsDoc.brands) {
    assert.ok(b.name && b.domain, b.id);
    assert.ok([1, 2, 3, 4].includes(b.price), `${b.id} price`);
    for (const s of b.styles) assert.ok(styles.has(s), `${b.id} style ${s}`);
    assert.ok(b.carries.length > 0, `${b.id} carries`);
    if (b.site) assert.ok(isHttps(b.site), `${b.id} site`);
  }
});

test('every offer has a source, dates and an in-store status', () => {
  const deals = load('data/deals.json');
  assert.ok(isIso(deals.checkedAt));
  for (const [id, entry] of Object.entries(deals.brands)) {
    assert.ok(brandIds.has(id), `deals for unknown brand ${id}`);
    assert.ok(isIso(entry.checkedAt), `${id} checkedAt`);
    if (entry.offersPage) assert.ok(isHttps(entry.offersPage.url), `${id} offersPage`);
    for (const o of entry.offers) {
      const where = `${id}: ${o.title}`;
      assert.ok(o.title && o.evidence && o.sourceName, where);
      assert.ok(isHttps(o.sourceUrl), `${where} sourceUrl`);
      assert.ok(['in-store', 'online', 'both', 'unknown'].includes(o.channel), `${where} channel`);
      assert.ok(['retailer', 'press'].includes(o.sourceType), `${where} sourceType`);
      assert.ok(['high', 'medium'].includes(o.confidence), `${where} confidence`);
      assert.ok(isDay(o.starts) && isDay(o.ends), `${where} dates`);
      if (o.starts && o.ends) assert.ok(o.starts <= o.ends, `${where} date order`);
    }
    if (entry.signup) {
      assert.ok(entry.signup.offer && isHttps(entry.signup.sourceUrl), `${id} signup`);
      assert.ok(['in-store', 'online', 'both', 'unknown'].includes(entry.signup.channel), `${id} signup channel`);
    }
  }
});

test('events have sources, dates and NYC coordinates when known', () => {
  const doc = load('data/events.json');
  const ids = new Set();
  for (const e of doc.events) {
    assert.ok(!ids.has(e.id), `duplicate event ${e.id}`);
    ids.add(e.id);
    assert.ok(e.name && e.evidence && isHttps(e.sourceUrl), e.id);
    assert.ok(isDay(e.starts) && isDay(e.ends) && e.starts <= e.ends, `${e.id} dates`);
    assert.ok(['high', 'medium'].includes(e.confidence), `${e.id} confidence`);
    if (e.lat != null) assert.ok(inNyc(e.lat, e.lon), `${e.id} coordinates`);
  }
});

test('generated store list (when present) matches the areas', { skip: !existsSync(new URL('../data/stores.json', import.meta.url)) }, () => {
  const doc = load('data/stores.json');
  const areaIds = new Set(areas.map((a) => a.id));
  const ids = new Set();
  for (const s of doc.stores) {
    assert.ok(!ids.has(s.id), `duplicate store ${s.id}`);
    ids.add(s.id);
    assert.ok(s.name && areaIds.has(s.area), s.id);
    assert.ok(inNyc(s.lat, s.lon), `${s.id} coordinates`);
  }
  const total = Object.values(doc.counts).reduce((a, b) => a + b, 0);
  assert.equal(total, doc.stores.length);
});
