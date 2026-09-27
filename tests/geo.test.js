import test from 'node:test';
import assert from 'node:assert/strict';
import { bboxOf, detourMeters, distanceMeters, formatMiles, pointInPolygon } from '../js/geo.js';

test('straight-line distance: SoHo to Herald Square is about 3 km', () => {
  const d = distanceMeters([40.7243, -73.9977], [40.7497, -73.9877]);
  assert.ok(d > 2800 && d < 3100, `got ${d}`);
});

test('mile labels', () => {
  assert.equal(formatMiles(100), 'under 0.1 mi');
  assert.equal(formatMiles(1609.344), '1.0 mi');
  assert.equal(formatMiles(482), '0.3 mi');
  assert.equal(formatMiles(25000), '16 mi');
});

test('point in polygon', () => {
  const square = [[40, -74], [40, -73], [41, -73], [41, -74]];
  assert.equal(pointInPolygon([40.5, -73.5], square), true);
  assert.equal(pointInPolygon([41.5, -73.5], square), false);
  assert.deepEqual(bboxOf(square), [40, -74, 41, -73]);
});

test('detour is zero on the way and positive off it', () => {
  const a = [40.72, -74.0];
  const b = [40.74, -74.0];
  assert.ok(detourMeters(a, [40.73, -74.0], b) < 1);
  assert.ok(detourMeters(a, [40.73, -73.98], b) > 500);
});
