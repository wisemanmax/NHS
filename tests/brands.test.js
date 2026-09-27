import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrandIndex, inferFromTags, matchBrand, tokens } from '../js/brands.js';

const { brands } = JSON.parse(readFileSync(new URL('../data/brands.json', import.meta.url), 'utf8'));
const index = buildBrandIndex(brands);
const match = (store) => matchBrand(store, index)?.id ?? null;

test('tokens normalize punctuation, accents and apostrophes', () => {
  assert.deepEqual(tokens("Levi's"), ['levis']);
  assert.deepEqual(tokens('Arc’teryx'), ['arcteryx']);
  assert.deepEqual(tokens('Sézane'), ['sezane']);
  assert.deepEqual(tokens('& Other Stories'), ['other', 'stories']);
});

test('chain names with location suffixes', () => {
  assert.equal(match({ name: 'Uniqlo Soho' }), 'uniqlo');
  assert.equal(match({ name: 'H&M' }), 'hm');
  assert.equal(match({ name: "Levi's Store" }), 'levis');
  assert.equal(match({ name: 'J.Crew Men' }), 'jcrew');
  assert.equal(match({ name: 'JCrew' }), 'jcrew');
  assert.equal(match({ name: 'T.J. Maxx' }), 'tjmaxx');
  assert.equal(match({ name: 'TJ Maxx' }), 'tjmaxx');
  assert.equal(match({ name: "L'Appartement Sézane" }), 'sezane');
  assert.equal(match({ name: 'The North Face' }), 'northface');
  assert.equal(match({ name: 'Arc’teryx' }), 'arcteryx');
  assert.equal(match({ name: 'Gap Factory' }), 'gap');
});

test('longest alias wins', () => {
  assert.equal(match({ name: 'Nordstrom Rack' }), 'nordstromrack');
  assert.equal(match({ name: 'Nordstrom' }), 'nordstrom');
  assert.equal(match({ name: 'Saks OFF 5TH' }), 'saksoff5th');
  assert.equal(match({ name: 'Saks Fifth Avenue' }), 'saks');
  assert.equal(match({ name: 'Carhartt WIP' }), 'carhartt-wip');
});

test('short and generic names only match with location words', () => {
  assert.equal(match({ name: 'On' }), 'on');
  assert.equal(match({ name: 'On SoHo' }), 'on');
  assert.equal(match({ name: 'On Point Boutique' }), null);
  assert.equal(match({ name: 'COS' }), 'cos');
  assert.equal(match({ name: 'Cosmic Threads' }), null);
  assert.equal(match({ name: 'Vince' }), 'vince');
  assert.equal(match({ name: 'Vince Camuto' }), null);
  assert.equal(match({ name: 'Supreme' }), 'supreme');
  assert.equal(match({ name: 'Supreme Fashion' }), null);
  assert.equal(match({ name: 'Gapstow Boutique' }), null);
});

test('brand tag and wikidata beat the display name', () => {
  assert.equal(match({ name: 'Some Store', brand: 'Zara' }), 'zara');
  const custom = buildBrandIndex([{ id: 'x', name: 'Xyz', wikidata: ['Q1'] }]);
  assert.equal(matchBrand({ name: 'Anything', wd: 'Q1' }, custom).id, 'x');
});

test('OSM tags give unresearched shops an honest basis', () => {
  const vintage = inferFromTags({ shop: 'second_hand', clothes: 'women;men' });
  assert.deepEqual(vintage.styles, ['vintage']);
  assert.deepEqual(vintage.who, ['Women', 'Men']);
  assert.ok(vintage.basis.includes('shop=second_hand'));

  const shoes = inferFromTags({ shop: 'shoes' });
  assert.ok(shoes.carries.includes('boots'));

  const boutique = inferFromTags({ shop: 'boutique' });
  assert.deepEqual(boutique.styles, []);
  assert.deepEqual(boutique.basis, []);
});
