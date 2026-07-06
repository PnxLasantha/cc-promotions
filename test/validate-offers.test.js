const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { parseExpiry } = require('../lib');

// Validates the generated offers.json (runs in CI after scrape, before commit).
// Skips gracefully when the file is absent. OFFERS_FILE overrides the path (test only).
const FILE = process.env.OFFERS_FILE || 'offers.json';
const present = fs.existsSync(FILE);
const data = present ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
const offers = data ? (data.offers || data) : [];

const CATEGORIES = new Set(['Dining', 'Hotel']);
const SOURCES = new Set(['scraped', 'carried', 'static']);

test('offers.json: schema of every offer', { skip: !present && 'offers.json absent' }, () => {
  offers.forEach((o, i) => {
    assert.ok(o.bank && o.bank.trim(), `offer ${i}: empty bank`);
    assert.ok(o.card && o.card.trim(), `offer ${i}: empty card`);
    assert.ok(o.merchant && o.merchant.trim(), `offer ${i}: empty merchant`);
    assert.ok(CATEGORIES.has(o.category), `offer ${i} (${o.merchant}): bad category ${o.category}`);
    assert.ok(SOURCES.has(o.source), `offer ${i} (${o.merchant}): bad source ${o.source}`);
  });
});

test('offers.json: no offer with a parseable validity date in the past', { skip: !present && 'offers.json absent' }, () => {
  const now = Date.now();
  const past = offers.filter((o) => {
    const d = parseExpiry(o.validity);
    return d && d.getTime() < now;
  });
  assert.strictEqual(past.length, 0,
    'expired offers present: ' + past.map((o) => `${o.merchant} (${o.validity})`).join('; '));
});

test('offers.json: total offers >= 100 (tripwire)', { skip: !present && 'offers.json absent' }, () => {
  assert.ok(offers.length >= 100, `only ${offers.length} offers`);
});

test('offers.json: no duplicate card|merchant|offer triples', { skip: !present && 'offers.json absent' }, () => {
  const seen = new Set();
  const dups = [];
  for (const o of offers) {
    const key = `${(o.card || '').toLowerCase().trim()}|${(o.merchant || '').toLowerCase().trim()}|${(o.offer || '').toLowerCase().trim()}`;
    if (seen.has(key)) dups.push(key);
    seen.add(key);
  }
  assert.strictEqual(dups.length, 0, 'duplicate triples: ' + dups.join('; '));
});
