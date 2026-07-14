// ponytail: single script, writes offers.json
const { chromium } = require('@playwright/test');
const fs = require('fs');
const { staticNtbHotelOffers, dedupe, isExpired, floorCheck, carryForward, previousCounts } = require('./lib');

// Date of the last manual fetch of the hardcoded NTB hotel block (git febf0c1).
const STATIC_SOURCED_AT = '2026-06-29';

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let y = 0;
      const id = setInterval(() => {
        window.scrollBy(0, 600);
        y += 600;
        if (y >= document.body.scrollHeight) { clearInterval(id); resolve(); }
      }, 200);
    });
  });
}

// Anchors on "Learn More" links + h6/h5 tags + exact-text category labels
// instead of class names, since a transient markup change tripped the floor
// guard on 2026-07-13 (run #31, NTB returned 0). Re-verified 2026-07-14 that
// the old .grid-item/.info/.promo-footer selectors are back and byte-for-byte
// match this version (71/71 offers) — kept the resilient version anyway so a
// future class rename doesn't repeat the outage. Page is fully server-rendered
// (no scroll needed to reach all 71 cards), autoScroll kept only as insurance.
async function scrapeNTB(page) {
  console.log('  NTB promotions page...');
  await page.goto('https://www.nationstrust.com/promotions', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await autoScroll(page);

  return page.evaluate(() => {
    const CATEGORY_MAP = { 'Dining': 'Dining', 'Hotels & Resorts': 'Hotel' };
    const CATEGORY_LABELS = Object.keys(CATEGORY_MAP);
    const results = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/promotions/"]').forEach(link => {
      if (!/learn\s*more/i.test(link.textContent || '')) return;

      // Walk up to the card container: first ancestor with h6 + h5;
      // bail out if it contains multiple cards.
      let card = link.parentElement;
      while (card && card !== document.body) {
        const learnMores = Array.from(card.querySelectorAll('a')).filter(a =>
          /learn\s*more/i.test(a.textContent || ''));
        if (learnMores.length > 1) { card = null; break; }
        if (card.querySelector('h6') && card.querySelector('h5')) break;
        card = card.parentElement;
      }
      if (!card || card === document.body) return;

      // Category from an exact-text leaf label — not class names, not substrings.
      const catEl = Array.from(card.querySelectorAll('*')).find(el =>
        el.children.length === 0 && CATEGORY_LABELS.includes((el.textContent || '').trim()));
      if (!catEl) return;
      const category = CATEGORY_MAP[catEl.textContent.trim()];

      const merchant = card.querySelector('h6')?.textContent?.trim();
      const offer    = card.querySelector('h5')?.textContent?.trim() || '';
      const validity = Array.from(card.querySelectorAll('*'))
        .filter(el => el.children.length === 0)
        .map(el => (el.textContent || '').trim())
        .find(t => /^(valid|booking period|stay period|until)/i.test(t)) || '';

      if (!merchant) return;
      const key = merchant + '|' + offer;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ merchant, offer, validity, category });
    });

    return results;
  });
}

async function scrapeAmex(page, url, category) {
  console.log(`  Amex ${category}...`);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await autoScroll(page);

  return page.evaluate((cat) => {
    return Array.from(document.querySelectorAll('.alloffer-box')).map(card => {
      const raw      = card.querySelector('.alloffer-heading')?.textContent?.trim() || '';
      const merchant = raw.includes('|') ? raw.split('|').pop().trim() : raw;
      const offer    = card.querySelector('.value-limit span')?.textContent?.trim() || '';
      const divs     = Array.from(card.querySelectorAll('.alloffer-text > div'));
      const validity = divs.find(d => /valid/i.test(d.textContent))?.textContent?.trim() || '';
      return merchant.length > 1 ? { merchant, offer, validity, category: cat } : null;
    }).filter(Boolean);
  }, category);
}

async function scrapeSeylan(page, baseUrl, category) {
  const all = [];
  let pageUrl = baseUrl;

  while (pageUrl) {
    console.log(`  Seylan ${category}: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1500);

    const items = await page.evaluate((cat) => {
      return Array.from(document.querySelectorAll('.card-body.new-promotion-card-body')).map(card => ({
        merchant: card.querySelector('.new-promotion-title')?.textContent?.trim() || '',
        offer:    card.querySelector('.new-promotion-dis')?.textContent?.trim() || '',
        validity: card.querySelector('.new-promotion-date')?.textContent?.trim() || '',
        category: cat
      })).filter(o => o.merchant.length > 1);
    }, category);

    all.push(...items);

    pageUrl = await page.$eval('a[rel="next"]', el => el.href).catch(() => null);
  }
  return all;
}

// Scrape sources. Each `run(page)` returns tagged offer objects for that source;
// amex and seylan internally cover their two categories.
const SOURCES = [
  {
    name: 'ntb-credit',
    run: async (page) => {
      console.log('\n[NTB Credit]');
      const ntb = await scrapeNTB(page);
      return ntb.map(o => ({ bank: 'NTB', card: 'NTB Credit', ...o }));
    },
  },
  {
    name: 'amex',
    run: async (page) => {
      console.log('\n[Amex]');
      const dining = await scrapeAmex(page, 'https://www.americanexpress.lk/en/offers/dining-offers', 'Dining');
      const hotel  = await scrapeAmex(page, 'https://www.americanexpress.lk/en/offers/lodging-offers', 'Hotel');
      return [...dining, ...hotel].map(o => ({ bank: 'NTB', card: 'Amex', ...o }));
    },
  },
  {
    name: 'seylan',
    run: async (page) => {
      console.log('\n[Seylan Credit]');
      const dining = await scrapeSeylan(page, 'https://www.seylan.lk/promotions/cards/dining', 'Dining');
      const hotel  = await scrapeSeylan(page, 'https://www.seylan.lk/promotions/cards/local-travel', 'Hotel');
      return [...dining, ...hotel].map(o => ({ bank: 'Seylan', card: 'Seylan Credit', ...o }));
    },
  },
];

function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync('offers.json', 'utf8'));
  } catch {
    return null;
  }
}

const srcOf = (o) => o.sourceName;

(async () => {
  const prev = loadPrevious();
  const prevOffers = (prev && prev.offers) || [];
  const prevCounts = previousCounts(prev);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const collected = [];
  const sourceStatus = {};
  let anyFailed = false;

  for (const src of SOURCES) {
    const previousCount = prevCounts[src.name] || 0;
    try {
      let offers = (await src.run(page)).map(o => ({ ...o, source: 'scraped', sourceName: src.name }));
      const count = offers.length;

      // Floor check: a source that collapses to < 50% of its previous count
      // (when we had a healthy history) is treated as markup drift → carry forward.
      if (!floorCheck(count, previousCount)) {
        console.log(`  ⚠ floor: ${count} offers < 50% of previous ${previousCount} — carrying forward`);
        collected.push(...carryForward(prevOffers, src.name, srcOf));
        sourceStatus[src.name] = { status: 'floor', count, previousCount };
        anyFailed = true;
      } else {
        collected.push(...offers);
        sourceStatus[src.name] = { status: 'ok', count, previousCount };
        console.log(`  → ${count} offers`);
      }
    } catch (err) {
      console.error(`  ✗ ${src.name} failed: ${err.message} — carrying forward`);
      collected.push(...carryForward(prevOffers, src.name, srcOf));
      sourceStatus[src.name] = { status: 'failed', count: 0, previousCount, error: err.message };
      anyFailed = true;
    }
  }

  await browser.close();

  // NTB hotel dedicated page is rate-limited (403) — data hardcoded from last
  // successful manual fetch; labeled so it is honest in output and UI (Task 5).
  collected.push(...staticNtbHotelOffers({ source: 'static', sourceName: 'ntb-hotels-static', sourcedAt: STATIC_SOURCED_AT }));

  // Deduplicate by card + merchant + offer (case-insensitive), keep first occurrence
  const deduped = dedupe(collected);

  // Drop expired offers (fail-open: offers with no readable date are kept).
  const droppedByCard = {};
  const live = deduped.filter(o => {
    if (isExpired(o.validity)) {
      droppedByCard[o.card] = (droppedByCard[o.card] || 0) + 1;
      return false;
    }
    return true;
  });
  const droppedTotal = deduped.length - live.length;
  console.log(`\nExpiry filter: dropped ${droppedTotal} expired offer(s)` +
    (droppedTotal ? ' — ' + Object.entries(droppedByCard).map(([c, n]) => `${c}: ${n}`).join(', ') : ''));

  const output = {
    updatedAt: new Date().toISOString(),
    staticSourcedAt: STATIC_SOURCED_AT,
    sourceStatus,
    offers: live,
  };
  fs.writeFileSync('offers.json', JSON.stringify(output, null, 2));
  console.log(`\nTotal: ${live.length} offers (${collected.length - deduped.length} dupes removed) → offers.json`);
  console.log('Source status:', JSON.stringify(sourceStatus));

  if (anyFailed) {
    console.error('\n✗ One or more sources failed or floored — see sourceStatus above.');
    process.exit(1);
  }
})();
