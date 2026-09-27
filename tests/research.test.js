import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FINDINGS_TOOL,
  addDays,
  collectUrls,
  mergeEvents,
  pickBrands,
  urlKey,
  validateEvents,
  validateFindings,
} from '../scripts/research-lib.mjs';

test('URL keys ignore scheme, www, query, fragment and trailing slash', () => {
  assert.equal(urlKey('https://www.vans.com/en-us/help/offers/?utm_source=x#top'), 'vans.com/en-us/help/offers');
  assert.equal(urlKey('http://www2.hm.com/en_us/sale.html'), 'hm.com/en_us/sale.html');
});

test('collects URLs from nested result blocks and text, skipping encrypted payloads', () => {
  const blocks = [
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.com/sale', encrypted_content: 'https://secret.com/x' }] },
    { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: 'https://b.com/offers/' } },
    { type: 'text', text: 'See https://c.com/terms for details.' },
  ];
  assert.deepEqual([...collectUrls(blocks)].sort(), ['a.com/sale', 'b.com/offers', 'c.com/terms']);
});

const offer = (over) => ({
  title: 'Extra 20% off',
  code: null,
  terms: 'Sale styles',
  exclusions: null,
  starts: null,
  ends: null,
  channel: 'unknown',
  sourceUrl: 'https://brand.com/offers',
  sourceName: 'brand.com',
  sourceType: 'retailer',
  evidence: 'Extra 20% off sale styles.',
  confidence: 'medium',
  ...over,
});

test('offers survive only with a retrieved source, sane dates and real confidence', () => {
  const seen = new Set(['brand.com/offers', 'brand.com/sale']);
  const { entry, dropped } = validateFindings(
    {
      offersPage: { url: 'https://brand.com/sale', label: 'Sale' },
      offers: [
        offer({}),
        offer({ title: 'Invented', sourceUrl: 'https://brand.com/made-up' }),
        offer({ title: 'Over', ends: '2026-09-20' }),
        offer({ title: 'Weak', confidence: 'low' }),
        offer({ title: 'Backwards', starts: '2026-10-05', ends: '2026-10-01' }),
      ],
      signup: { offer: '10% off', channel: 'online', sourceUrl: 'https://elsewhere.com/x', evidence: '10% off' },
      notes: null,
    },
    seen,
    '2026-09-27',
    '2026-09-27T12:00:00Z',
  );
  assert.deepEqual(entry.offers.map((o) => o.title), ['Extra 20% off']);
  assert.equal(entry.offersPage.label, 'Sale');
  assert.equal(entry.signup, null);
  assert.equal(entry.checkedAt, '2026-09-27T12:00:00Z');
  assert.equal(dropped.length, 5);
});

test('events: window, dedupe and ended cleanup', () => {
  assert.equal(addDays('2026-09-27', 7), '2026-10-04');
  const seen = new Set(['260samplesale.com/pages/events/x']);
  const base = {
    kind: 'sample-sale', brands: [], category: 'Clothing', venue: null, address: null, hours: null, discount: null,
    rules: null, sourceName: '260', evidence: '…', confidence: 'high', sourceUrl: 'https://260samplesale.com/pages/events/x',
  };
  const { events, dropped } = validateEvents(
    [
      { ...base, name: 'X Sample Sale', starts: '2026-09-29', ends: '2026-10-02' },
      { ...base, name: 'Old Sale', starts: '2025-09-29', ends: '2025-10-02' },
      { ...base, name: 'Unsourced', starts: '2026-09-29', ends: '2026-09-30', sourceUrl: 'https://nowhere.com/a' },
    ],
    seen,
    '2026-09-27',
  );
  assert.deepEqual(events.map((e) => e.id), ['x-sample-sale-2026-09-29']);
  assert.equal(events[0].lat, null);
  assert.equal(dropped.length, 2);

  const existing = [
    { id: 'ended', ends: '2026-09-26', sourceUrl: 'https://a.com/1' },
    { id: 'same-page', ends: '2026-10-01', sourceUrl: 'https://260samplesale.com/pages/events/x/' },
  ];
  const merged = mergeEvents(existing, events, '2026-09-27');
  assert.deepEqual(merged.map((e) => e.id), ['same-page']);
});

test('brand picking: explicit ids, or shops on the map minus fresh research, luxury last', () => {
  const brands = [
    { id: 'lux', name: 'Lux', price: 4 },
    { id: 'a', name: 'A', price: 2 },
    { id: 'b', name: 'B', price: 1 },
    { id: 'fresh', name: 'Fresh', price: 2 },
    { id: 'nostores', name: 'None', price: 2 },
  ];
  const stores = [{ b: 'lux' }, { b: 'lux' }, { b: 'lux' }, { b: 'a' }, { b: 'b' }, { b: 'b' }, { b: 'fresh' }];
  const now = new Date('2026-09-27T15:00:00Z');
  const picked = pickBrands({
    brands,
    deals: { fresh: { checkedAt: '2026-09-27T13:00:00Z' } },
    stores,
    matchBrand: (s) => brands.find((x) => x.id === s.b),
    now,
  });
  assert.deepEqual(picked.map((b) => b.id), ['b', 'a', 'lux']);
  assert.deepEqual(pickBrands({ brands, only: ['nostores'] }).map((b) => b.id), ['nostores']);
});

test('the findings tool schema is strict-mode compatible', () => {
  const walk = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s.items) walk(s.items);
    if (s.anyOf) s.anyOf.forEach(walk);
  };
  assert.equal(FINDINGS_TOOL.strict, true);
  walk(FINDINGS_TOOL.input_schema);
});
