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

  // NTB hotel dedicated page is rate-limited (403) — data hardcoded from last successful fetch
  const ntbHotels = [
    ["Oasey Beach Hotel","20% off","Until 31 Oct 2026"],
    ["Thaha's at Galle Fort","10% off","Until 30 Jun 2027"],
    ["Amaara Forest Hotel, Sigiriya & Amaara Sky Hotel, Kandy","50% off","Stays until 31 Aug 2026"],
    ["Citrus Waskaduwa","15% off","1–31 Jul 2026"],
    ["Sigiriana Resort by Thilanka Dambulla","35% off","Until 31 Oct 2026"],
    ["Morven Hotel, Colombo","20% off","Until 31 Oct 2026"],
    ["The Flame Tree Estate, Galagedara","40% off","Until 30 Sep 2026"],
    ["WildEscape - Yala","Up to 15% off","Until 31 Jul 2026"],
    ["Ravana Garden","60% off","Until 31 Jul 2026"],
    ["Mandara Resort - Mirissa","30% off","Until 30 Nov 2025"],
    ["Mandara Rosen - Kataragama","30% off","Until 30 Nov 2025"],
    ["Anantaya Resorts & Spa - Pasikudah","Up to 50% off","Until 15 Jul 2026"],
    ["Anantaya Resorts & Spa - Chilaw","Up to 50% off","Until 30 Aug 2026"],
    ["Aarunya Nature Resort & Spa","10% savings on DBL","Until 31 Oct 2026"],
    ["Avani Kalutara Resort","Special rates from LKR 45,000","Until 21 Aug 2026"],
    ["Anantara Peace Haven Tangalle Resort","Special rates from LKR 95,000","Until 31 Aug 2026"],
    ["Anantara Kalutara Resort","Special rates from LKR 72,000","Until 31 Aug 2026"],
    ["Tropical Life Resort & Spa Dambulla","35% off","Until 30 Jun 2026"],
    ["Sudu Araliya, Polonnaruwa","35% off","Until 31 Jul 2026"],
    ["Wattura Resort & Spa","Up to 35% off","Until 15 Dec 2026"],
    ["Apa Villa Thalpe / Era Beach Thalpe / Lotus Estate / Joe's Resorts","20% off","Until 31 Dec 2026"],
    ["Luxor Kirindi Ella Resort & Spa","Up to 20% off","Until 31 Jul 2026"],
    ["Thilanka Hotel Kandy","35% off","Until 15 Aug 2026"],
    ["Trio Lodge, Habarana","35% off","Until 31 Oct 2026"],
    ["Hotel Tree of Life Nature Resort","20% off","1 Apr – 31 Oct 2026"],
    ["Nyne Hotels","30% off","5 Jun – 30 Nov 2026"],
    ["Mahaweli Reach Hotel","20% off","Until 30 Jun 2026"],
    ["Saluditya Retreat & Spa","20% off","Until 30 Jun 2026"],
    ["Athulya Villa, Kandy","25% off","Until 31 Jan 2027"],
    ["Elegant Hotel, Kandy","20% off","1 Apr – 30 Jun 2026"],
    ["Banana Bunks Mirissa & Kandy","25% off","Until 1 Jul 2026"],
    ["Kent Cottage","25% off","Until 1 Jul 2026"],
    ["Fox Resort Kandy","40% off","1 Apr – 30 Jun 2026"],
    ["Fox Resort Jaffna","35% off","1 Apr – 30 Jun 2026"],
    ["Hanthana Eco Lodge","Up to 50% off","1 May – 30 Jun 2026"],
    ["Uga Prava, Tangalle","20% off","Until 30 Jun 2026"],
    ["Taj Bentota Resort & Spa","25% off","Until 31 Oct 2026"],
    ["Hide Ella Hotel and Resort","40% off","1 May – 15 Jul 2026"],
    ["Wild Culture Yala","25% off","1 May – 31 Oct 2026"],
    ["The Golden Crown Hotel, Kandy","25% off","1 May – 15 Jul 2026"],
    ["The Golden Ridge, Nuwara Eliya","20% off","1 May – 15 Jul 2026"],
    ["Kahanda Kanda","30% off","1 May – 31 Oct 2026"],
    ["The Villa Bentota","30% off","1 May – 31 Oct 2026"],
    ["KK Beach","35% off","1 May – 31 Oct 2026"],
    ["ARD LUI Residence","30% off","1 May – 31 Jul 2026"],
    ["Amagi Aria, Negombo","Up to 20% off","Until 31 Jul 2026"],
    ["Amagi Beach, Marawila","Up to 20% off","Until 31 Jul 2026"],
    ["The Glenrock Wellness Nature Resort","25% off","Until 30 Jun 2026"],
    ["Randiya Sea View Hotel, Mirissa","20% off","11 May – 30 Nov 2026"],
    ["Earl's Regent Hotel, Kandy","30% off","11 May – 31 Jul 2026"],
    ["Sigiriya Jungles Resort & Spa","Up to 35% off","Until 15 Jul 2026"],
    ["Simpson's Forest Luxury Boutique Resort & Spa, Kandy","25% off","Until 31 Oct 2026"],
    ["Aprota Villas","25% off","Until 31 Dec 2026"],
    ["Elephant Reach Hotel","25% off","15 May – 15 Jul 2026"],
    ["Celestia Ayurveda Resort","25% off","1 Jun – 31 Aug 2026"],
    ["Villa Labugolla","Up to 20% off","Until 31 Jul 2026"],
    ["The Sun House, Galle","Special rates (BB/HB/FB)","8 May – 31 Jul 2026"],
    ["Regal Reseau Hotel & Spa","30% off","Until 30 Jun 2026"],
    ["Sigiriya Village Hotel","30% off","Until 31 Jul 2026"],
    ["Club Palm Bay, Marawila","30% off","Until 31 Jul 2026"],
    ["Uga Jungle Beach, Trincomalee","45% off","Until 30 Jun 2025"],
    ["Uga Bay","45% off","Until 30 Jun 2025"],
    ["Araliya Green City Hotel, Nuwara Eliya","30% off","Until 31 Jul 2026"],
    ["Araliya Green Hills Hotel, Nuwara Eliya","30% off","Until 31 Jul 2026"],
    ["Araliya Red Hotel, Nuwara Eliya","30% off","Until 31 Jul 2026"],
  ].map(([merchant, offer, validity]) => ({ bank: 'NTB', card: 'NTB Credit', merchant, offer, validity, category: 'Hotel' }));

  all.push(...ntbHotels);

  // Deduplicate by card + merchant (case-insensitive), keep first occurrence
  const seen = new Set();
  const deduped = all.filter(o => {
    const key = `${o.card}|${o.merchant.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const output = { updatedAt: new Date().toISOString(), offers: deduped };
  fs.writeFileSync('offers.json', JSON.stringify(output, null, 2));
  console.log(`\nTotal: ${deduped.length} offers (${all.length - deduped.length} dupes removed) → offers.json`);
})();
