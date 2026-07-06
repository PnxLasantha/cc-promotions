const { test } = require('node:test');
const assert = require('node:assert');
const { parseExpiry, isExpired, dedupe, floorCheck, carryForward } = require('../lib');

// --- Task 2: parseExpiry / isExpired -------------------------------------

function ymd(d) {
  return d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('parseExpiry: one assertion per real validity format', () => {
  const cases = [
    ['Valid till 31st July 2026', '2026-07-31'],
    ['Valid till  31st August 2026', '2026-08-31'],             // double space
    ['Valid from 1st July to 31st August 2026', '2026-08-31'],  // last date wins
    ['Valid every Sat from 1st July to 31st August 2026', '2026-08-31'],
    ['Valid on Mondays from 1st of July 31st July 2026', '2026-07-31'],
    ['Valid from 3rd to 19th July 2026', '2026-07-19'],         // day-only first date
    ['Until 31 Oct 2026', '2026-10-31'],                        // abbrev month, no ordinal
    ['Stays until 31 Aug 2026', '2026-08-31'],
    ['1–31 Jul 2026', '2026-07-31'],                            // en dash range
    ['1 Apr – 31 Oct 2026', '2026-10-31'],
    ['11 May – 30 Nov 2026', '2026-11-30'],
    ['Special rates from LKR 45,000', null],                    // no date — must not crash
    ['', null],                                                 // empty string
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(ymd(parseExpiry(input)), expected, `parseExpiry(${JSON.stringify(input)})`);
  }
});

test('parseExpiry: valid through end of expiry day (23:59:59)', () => {
  const d = parseExpiry('Valid till 31st July 2026');
  assert.strictEqual(d.getHours(), 23);
  assert.strictEqual(d.getMinutes(), 59);
});

test('isExpired: fail-open on unparseable / empty', () => {
  assert.strictEqual(isExpired('', new Date(2026, 6, 6)), false);
  assert.strictEqual(isExpired('Special rates from LKR 45,000', new Date(2026, 6, 6)), false);
});

test('isExpired: boundary cases', () => {
  assert.strictEqual(isExpired('Until 30 Jun 2025', new Date(2026, 6, 6)), true);
  assert.strictEqual(isExpired('Valid till 31st July 2026', new Date(2026, 6, 31)), false); // last valid day
  assert.strictEqual(isExpired('Valid till 31st July 2026', new Date(2026, 7, 1)), true);   // next day
});

// --- Task 3: dedupe by card|merchant|offer -------------------------------

test('dedupe: keeps distinct offers at same card+merchant', () => {
  const offers = [
    { card: 'X', merchant: 'M', offer: '10% off' },
    { card: 'X', merchant: 'M', offer: '20% off' },
  ];
  assert.strictEqual(dedupe(offers).length, 2);
});

test('dedupe: collapses exact duplicates', () => {
  const offers = [
    { card: 'X', merchant: 'M', offer: '10% off' },
    { card: 'X', merchant: 'M', offer: '10% off' },
  ];
  assert.strictEqual(dedupe(offers).length, 1);
});

test('dedupe: collapses case/whitespace variants of the same triple', () => {
  const offers = [
    { card: 'X', merchant: 'M', offer: '10% off' },
    { card: 'X', merchant: ' m ', offer: '10% OFF' },
  ];
  assert.strictEqual(dedupe(offers).length, 1);
});

// --- Task 4: floorCheck / carryForward -----------------------------------

test('floorCheck: markup-drift detection with prev>=10 guard', () => {
  assert.strictEqual(floorCheck(4, 100), false);  // 4% of prev -> fail
  assert.strictEqual(floorCheck(60, 100), true);  // 60% -> ok
  assert.strictEqual(floorCheck(2, 5), true);      // prev < 10 guard -> ok
  assert.strictEqual(floorCheck(0, 0), true);      // no history -> ok
});

test('carryForward: reuses previous offers for a failed source', () => {
  const prev = [
    { source: 'scraped', card: 'A', merchant: 'M1', offer: 'o', __src: 'amex' },
    { source: 'scraped', card: 'B', merchant: 'M2', offer: 'o', __src: 'seylan' },
  ];
  const carried = carryForward(prev, 'amex', (o) => o.__src);
  assert.strictEqual(carried.length, 1);
  assert.strictEqual(carried[0].source, 'carried');
  assert.strictEqual(carried[0].merchant, 'M1');
});
