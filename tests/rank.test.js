import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSections, catalogMatch, parseQuery } from '../js/rank.js';

test('query parsing maps words to catalog categories', () => {
  assert.deepEqual(parseQuery('black ankle boots'), ['boots']);
  assert.deepEqual(parseQuery('Denim jacket').sort(), ['denim', 'outerwear']);
  assert.deepEqual(parseQuery('vintage tee').sort(), ['secondhand', 'tees']);
  assert.deepEqual(parseQuery(''), []);
});

const item = (over) => ({
  id: over.id,
  name: over.id,
  dist: 200,
  styles: [],
  carries: [],
  price: null,
  researched: false,
  hasOffer: false,
  status: { state: 'unknown' },
  visit: null,
  ...over,
});

const baseCtx = { mode: 'browse', styles: new Set(), sort: 'best', categories: [], prefs: {} };

test('browse: open beats closed, unresearched shops go to their own section', () => {
  const items = [
    item({ id: 'closed', styles: ['basics'], researched: true, status: { state: 'closed', opensAt: 600 } }),
    item({ id: 'open', styles: ['basics'], researched: true, dist: 350, status: { state: 'open', closesIn: 120 } }),
    item({ id: 'mystery' }),
  ];
  const { main, other } = buildSections(items, baseCtx);
  assert.deepEqual(main.map((i) => i.id), ['open', 'closed']);
  assert.deepEqual(other.map((i) => i.id), ['mystery']);
});

test('browse: style chips filter researched stores and boost multi-matches', () => {
  const items = [
    item({ id: 'street', styles: ['street'], researched: true }),
    item({ id: 'denim-basics', styles: ['denim', 'basics'], researched: true, dist: 600 }),
    item({ id: 'basics', styles: ['basics'], researched: true, dist: 300 }),
  ];
  const { main, hidden } = buildSections(items, { ...baseCtx, styles: new Set(['denim', 'basics']) });
  assert.deepEqual(main.map((i) => i.id), ['denim-basics', 'basics']);
  assert.equal(hidden, 1);
});

test('browse: budget and offers-only filters', () => {
  const items = [
    item({ id: 'cheap', styles: ['basics'], researched: true, price: 1 }),
    item({ id: 'pricey', styles: ['basics'], researched: true, price: 4, hasOffer: true }),
  ];
  assert.deepEqual(buildSections(items, { ...baseCtx, budget: 2 }).main.map((i) => i.id), ['cheap']);
  assert.deepEqual(buildSections(items, { ...baseCtx, offersOnly: true }).main.map((i) => i.id), ['pricey']);
});

test('find: catalog matches first, unknown catalogs separate, non-matches hidden', () => {
  const items = [
    item({ id: 'boots-far', carries: ['boots', 'shoes'], researched: true, dist: 1200 }),
    item({ id: 'tees-near', carries: ['tees'], researched: true, dist: 50 }),
    item({ id: 'unknown', dist: 20 }),
  ];
  const { main, other, hidden } = buildSections(items, { ...baseCtx, mode: 'find', categories: ['boots'] });
  assert.deepEqual(main.map((i) => i.id), ['boots-far']);
  assert.deepEqual(other.map((i) => i.id), ['unknown']);
  assert.equal(hidden, 1);
  assert.deepEqual(catalogMatch(items[0], ['boots', 'bags']), { state: 'yes', matched: ['boots'], ratio: 0.5 });
});

test('feedback: visited stores sink, learned style weights reorder', () => {
  const items = [
    item({ id: 'visited', styles: ['basics'], researched: true, visit: { outcome: 'wrongfit' } }),
    item({ id: 'fresh', styles: ['basics'], researched: true, dist: 500 }),
  ];
  assert.deepEqual(buildSections(items, baseCtx).main.map((i) => i.id), ['fresh', 'visited']);

  const vibes = [
    item({ id: 'street', styles: ['street'], researched: true }),
    item({ id: 'preppy', styles: ['preppy'], researched: true }),
  ];
  const ctx = { ...baseCtx, prefs: { styleWeights: { street: -2, preppy: 1 } } };
  assert.deepEqual(buildSections(vibes, ctx).main.map((i) => i.id), ['preppy', 'street']);
});
