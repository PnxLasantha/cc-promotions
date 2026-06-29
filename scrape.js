// ponytail: single script, writes offers.json
const { chromium } = require('@playwright/test');
const fs = require('fs');

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

async function scrapeNTB(page) {
  console.log('  NTB promotions page...');
  await page.goto('https://www.nationstrust.com/promotions', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await autoScroll(page);

  return page.evaluate(() => {
    const results = [];
    document.querySelectorAll('.grid-item').forEach(card => {
      const classes = card.className;
      const isDining = classes.includes('dining');
      const isHotel  = classes.includes('hotels-resorts');
      if (!isDining && !isHotel) return;

      const merchant  = card.querySelector('.info h6')?.textContent?.trim();
      const offer     = card.querySelector('.info h5')?.textContent?.trim() || '';
      const validity  = card.querySelector('.promo-footer small')?.textContent?.trim() || '';
      const category  = isHotel ? 'Hotel' : 'Dining';

      if (merchant) results.push({ merchant, offer, validity, category });
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const all = [];

  // NTB Credit (Mastercard)
  console.log('\n[NTB Credit]');
  const ntb = await scrapeNTB(page);
  ntb.forEach(o => all.push({ bank: 'NTB', card: 'NTB Credit', ...o }));
  console.log(`  → ${ntb.length} offers`);

  // Amex (issued by NTB)
  console.log('\n[Amex]');
  const amexDining = await scrapeAmex(page, 'https://www.americanexpress.lk/en/offers/dining-offers', 'Dining');
  const amexHotel  = await scrapeAmex(page, 'https://www.americanexpress.lk/en/offers/lodging-offers', 'Hotel');
  [...amexDining, ...amexHotel].forEach(o => all.push({ bank: 'NTB', card: 'Amex', ...o }));
  console.log(`  → ${amexDining.length} dining + ${amexHotel.length} hotel`);

  // Seylan Credit
  console.log('\n[Seylan Credit]');
  const seyDining = await scrapeSeylan(page, 'https://www.seylan.lk/promotions/cards/dining', 'Dining');
  const seyHotel  = await scrapeSeylan(page, 'https://www.seylan.lk/promotions/cards/local-travel', 'Hotel');
  [...seyDining, ...seyHotel].forEach(o => all.push({ bank: 'Seylan', card: 'Seylan Credit', ...o }));
  console.log(`  → ${seyDining.length} dining + ${seyHotel.length} hotel`);

  await browser.close();

  fs.writeFileSync('offers.json', JSON.stringify(all, null, 2));
  console.log(`\nTotal: ${all.length} offers → offers.json`);
})();
