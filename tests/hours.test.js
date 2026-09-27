import test from 'node:test';
import assert from 'node:assert/strict';
import { openStatus, parseOpeningHours, statusLabel, formatClock } from '../js/hours.js';

// Sunday Sep 27, 2026 is on Eastern Daylight Time (UTC-4).
const nyc = (isoLocal) => new Date(`${isoLocal}-04:00`);

test('typical weekday/Sunday hours', () => {
  const h = parseOpeningHours('Mo-Sa 10:00-20:00; Su 11:00-19:00');
  assert.deepEqual(openStatus(h, nyc('2026-09-27T18:30:00')), { state: 'open', closesIn: 30, closesAt: 1140 });
  assert.equal(statusLabel(openStatus(h, nyc('2026-09-27T18:30:00'))).text, 'Closes in 30 min');
  assert.equal(statusLabel(openStatus(h, nyc('2026-09-27T12:00:00'))).text, 'Open until 7 PM');
  assert.equal(statusLabel(openStatus(h, nyc('2026-09-27T09:00:00'))).text, 'Closed · opens 11 AM');
  assert.equal(statusLabel(openStatus(h, nyc('2026-09-27T19:30:00'))).text, 'Closed · opens tomorrow 10 AM');
});

test('comma between rules is tolerated', () => {
  const h = parseOpeningHours('Mo-Sa 10:00-20:00, Su 11:00-19:00');
  assert.equal(openStatus(h, nyc('2026-09-27T11:30:00')).state, 'open');
  assert.equal(openStatus(h, nyc('2026-09-27T10:30:00')).state, 'closed');
});

test('time-only rule applies every day; 24/7', () => {
  assert.equal(openStatus(parseOpeningHours('10:00-21:00'), nyc('2026-09-27T20:59:00')).closesIn, 1);
  const always = openStatus(parseOpeningHours('24/7'), nyc('2026-09-27T03:00:00'));
  assert.equal(statusLabel(always).text, 'Open 24 hours');
});

test('closed days and multi-day lookahead', () => {
  const h = parseOpeningHours('Mo-Fr 10:00-19:00; Sa-Su off');
  const s = openStatus(h, nyc('2026-09-26T12:00:00')); // Saturday
  assert.equal(s.state, 'closed');
  assert.equal(statusLabel(s).text, 'Closed · opens Mon 10 AM');
});

test('later rules override earlier ones; day lists', () => {
  const h = parseOpeningHours('Mo-We,Fr-Su 10:00-20:00; Th 10:00-21:00; Su 12:00-18:00');
  assert.equal(openStatus(h, nyc('2026-09-27T11:00:00')).state, 'closed'); // Sunday opens at noon
  assert.equal(openStatus(h, nyc('2026-10-01T20:30:00')).state, 'open'); // Thursday
});

test('hours running past midnight', () => {
  const h = parseOpeningHours('Fr-Sa 18:00-02:00');
  const s = openStatus(h, nyc('2026-09-26T01:00:00')); // early Saturday = Friday night
  assert.equal(s.state, 'open');
  assert.equal(s.closesIn, 60);
});

test('unsupported rules are skipped or rejected, never guessed', () => {
  const h = parseOpeningHours('Mo-Su 10:00-20:00; Dec 25 off; PH off');
  assert.equal(h.partial, true);
  assert.equal(openStatus(h, nyc('2026-09-27T12:00:00')).state, 'open');
  assert.equal(parseOpeningHours('sunrise-sunset'), null);
  assert.equal(parseOpeningHours(''), null);
  assert.deepEqual(openStatus(null), { state: 'unknown' });
  assert.equal(statusLabel({ state: 'unknown' }), null);
});

test('clock formatting', () => {
  assert.equal(formatClock(0), '12 AM');
  assert.equal(formatClock(750), '12:30 PM');
  assert.equal(formatClock(1260), '9 PM');
});
