// Pure logic extracted from scrape.js so it is testable without Playwright.
// No browser / Playwright imports may be added here.

// The NTB hotel dedicated page is rate-limited (403); this data is hardcoded
// from the last successful manual fetch (see staticSourcedAt in scrape.js).
const NTB_HOTELS_STATIC = [
  ["Oasey Beach Hotel", "20% off", "Until 31 Oct 2026"],
  ["Thaha's at Galle Fort", "10% off", "Until 30 Jun 2027"],
  ["Amaara Forest Hotel, Sigiriya & Amaara Sky Hotel, Kandy", "50% off", "Stays until 31 Aug 2026"],
  ["Citrus Waskaduwa", "15% off", "1–31 Jul 2026"],
  ["Sigiriana Resort by Thilanka Dambulla", "35% off", "Until 31 Oct 2026"],
  ["Morven Hotel, Colombo", "20% off", "Until 31 Oct 2026"],
  ["The Flame Tree Estate, Galagedara", "40% off", "Until 30 Sep 2026"],
  ["WildEscape - Yala", "Up to 15% off", "Until 31 Jul 2026"],
  ["Ravana Garden", "60% off", "Until 31 Jul 2026"],
  ["Mandara Resort - Mirissa", "30% off", "Until 30 Nov 2025"],
  ["Mandara Rosen - Kataragama", "30% off", "Until 30 Nov 2025"],
  ["Anantaya Resorts & Spa - Pasikudah", "Up to 50% off", "Until 15 Jul 2026"],
  ["Anantaya Resorts & Spa - Chilaw", "Up to 50% off", "Until 30 Aug 2026"],
  ["Aarunya Nature Resort & Spa", "10% savings on DBL", "Until 31 Oct 2026"],
  ["Avani Kalutara Resort", "Special rates from LKR 45,000", "Until 21 Aug 2026"],
  ["Anantara Peace Haven Tangalle Resort", "Special rates from LKR 95,000", "Until 31 Aug 2026"],
  ["Anantara Kalutara Resort", "Special rates from LKR 72,000", "Until 31 Aug 2026"],
  ["Tropical Life Resort & Spa Dambulla", "35% off", "Until 30 Jun 2026"],
  ["Sudu Araliya, Polonnaruwa", "35% off", "Until 31 Jul 2026"],
  ["Wattura Resort & Spa", "Up to 35% off", "Until 15 Dec 2026"],
  ["Apa Villa Thalpe / Era Beach Thalpe / Lotus Estate / Joe's Resorts", "20% off", "Until 31 Dec 2026"],
  ["Luxor Kirindi Ella Resort & Spa", "Up to 20% off", "Until 31 Jul 2026"],
  ["Thilanka Hotel Kandy", "35% off", "Until 15 Aug 2026"],
  ["Trio Lodge, Habarana", "35% off", "Until 31 Oct 2026"],
  ["Hotel Tree of Life Nature Resort", "20% off", "1 Apr – 31 Oct 2026"],
  ["Nyne Hotels", "30% off", "5 Jun – 30 Nov 2026"],
  ["Mahaweli Reach Hotel", "20% off", "Until 30 Jun 2026"],
  ["Saluditya Retreat & Spa", "20% off", "Until 30 Jun 2026"],
  ["Athulya Villa, Kandy", "25% off", "Until 31 Jan 2027"],
  ["Elegant Hotel, Kandy", "20% off", "1 Apr – 30 Jun 2026"],
  ["Banana Bunks Mirissa & Kandy", "25% off", "Until 1 Jul 2026"],
  ["Kent Cottage", "25% off", "Until 1 Jul 2026"],
  ["Fox Resort Kandy", "40% off", "1 Apr – 30 Jun 2026"],
  ["Fox Resort Jaffna", "35% off", "1 Apr – 30 Jun 2026"],
  ["Hanthana Eco Lodge", "Up to 50% off", "1 May – 30 Jun 2026"],
  ["Uga Prava, Tangalle", "20% off", "Until 30 Jun 2026"],
  ["Taj Bentota Resort & Spa", "25% off", "Until 31 Oct 2026"],
  ["Hide Ella Hotel and Resort", "40% off", "1 May – 15 Jul 2026"],
  ["Wild Culture Yala", "25% off", "1 May – 31 Oct 2026"],
  ["The Golden Crown Hotel, Kandy", "25% off", "1 May – 15 Jul 2026"],
  ["The Golden Ridge, Nuwara Eliya", "20% off", "1 May – 15 Jul 2026"],
  ["Kahanda Kanda", "30% off", "1 May – 31 Oct 2026"],
  ["The Villa Bentota", "30% off", "1 May – 31 Oct 2026"],
  ["KK Beach", "35% off", "1 May – 31 Oct 2026"],
  ["ARD LUI Residence", "30% off", "1 May – 31 Jul 2026"],
  ["Amagi Aria, Negombo", "Up to 20% off", "Until 31 Jul 2026"],
  ["Amagi Beach, Marawila", "Up to 20% off", "Until 31 Jul 2026"],
  ["The Glenrock Wellness Nature Resort", "25% off", "Until 30 Jun 2026"],
  ["Randiya Sea View Hotel, Mirissa", "20% off", "11 May – 30 Nov 2026"],
  ["Earl's Regent Hotel, Kandy", "30% off", "11 May – 31 Jul 2026"],
  ["Sigiriya Jungles Resort & Spa", "Up to 35% off", "Until 15 Jul 2026"],
  ["Simpson's Forest Luxury Boutique Resort & Spa, Kandy", "25% off", "Until 31 Oct 2026"],
  ["Aprota Villas", "25% off", "Until 31 Dec 2026"],
  ["Elephant Reach Hotel", "25% off", "15 May – 15 Jul 2026"],
  ["Celestia Ayurveda Resort", "25% off", "1 Jun – 31 Aug 2026"],
  ["Villa Labugolla", "Up to 20% off", "Until 31 Jul 2026"],
  ["The Sun House, Galle", "Special rates (BB/HB/FB)", "8 May – 31 Jul 2026"],
  ["Regal Reseau Hotel & Spa", "30% off", "Until 30 Jun 2026"],
  ["Sigiriya Village Hotel", "30% off", "Until 31 Jul 2026"],
  ["Club Palm Bay, Marawila", "30% off", "Until 31 Jul 2026"],
  ["Uga Jungle Beach, Trincomalee", "45% off", "Until 30 Jun 2025"],
  ["Uga Bay", "45% off", "Until 30 Jun 2025"],
  ["Araliya Green City Hotel, Nuwara Eliya", "30% off", "Until 31 Jul 2026"],
  ["Araliya Green Hills Hotel, Nuwara Eliya", "30% off", "Until 31 Jul 2026"],
  ["Araliya Red Hotel, Nuwara Eliya", "30% off", "Until 31 Jul 2026"],
];

// Map the static tuples to offer objects. `extra` merges extra fields onto each
// offer (e.g. { source: 'static', sourcedAt: '...' }) — see Task 5.
function staticNtbHotelOffers(extra = {}) {
  return NTB_HOTELS_STATIC.map(([merchant, offer, validity]) => ({
    bank: 'NTB', card: 'NTB Credit', merchant, offer, validity, category: 'Hotel', ...extra,
  }));
}

// Deduplicate offers, keeping the first occurrence of each key.
// Key is card|merchant|offer (all lowercased/trimmed) so two distinct offers at
// the same merchant are both kept.
const norm = (s) => (s || '').toLowerCase().trim();
function dedupe(offers, keyFn = (o) => `${norm(o.card)}|${norm(o.merchant)}|${norm(o.offer)}`) {
  const seen = new Set();
  return offers.filter((o) => {
    const key = keyFn(o);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Validity-date expiry (Task 2) ---------------------------------------

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Extract the LAST parseable date in a validity string. Handles
// `DD(st|nd|rd|th)? <Month|Abbrev> YYYY`, tolerating multiple spaces, "of",
// weekday noise, en dashes and till/until/to variants (the last-date rule makes
// those irrelevant). Returns a Date at end-of-day (23:59:59.999) local, or null.
function parseExpiry(validityString) {
  if (!validityString || typeof validityString !== 'string') return null;
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)\s+(\d{4})/g;
  let last = null;
  for (const m of validityString.matchAll(re)) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month === undefined) continue;
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    last = new Date(Number(m[3]), month, day, 23, 59, 59, 999);
  }
  return last;
}

// Offer is expired only if `now` is strictly after the end of the expiry day.
// Unparseable date -> false (fail-open: never drop an offer we cannot read).
function isExpired(validityString, now = new Date()) {
  const expiry = parseExpiry(validityString);
  if (!expiry) return false;
  return now.getTime() > expiry.getTime();
}

// --- Floor check + carry-forward (Task 4) --------------------------------

// A source that returned < 50% of its previous count (when previous >= 10) is
// treated as failed — markup drift is the likely cause. Returns true if OK.
function floorCheck(newCount, prevCount) {
  if (prevCount < 10) return true;
  return newCount >= prevCount * 0.5;
}

// Reuse a failed source's offers from the previous offers array, re-tagged as
// 'carried'. srcOf(offer) returns the source name an offer belongs to.
function carryForward(prevOffers, sourceName, srcOf) {
  return (prevOffers || [])
    .filter((o) => srcOf(o) === sourceName)
    .map((o) => ({ ...o, source: 'carried' }));
}

// Per-source floor-check baseline from the previous offers.json. The baseline
// ratchets on health: only a status:'ok' run adopts its raw count; failed/floor
// runs carry the last healthy previousCount forward, so the alert never disarms
// itself. Falls back to counting by sourceName for pre-sourceStatus files.
function previousCounts(prev) {
  if (prev && prev.sourceStatus) {
    const counts = {};
    for (const [name, s] of Object.entries(prev.sourceStatus)) {
      counts[name] = s.status === 'ok' ? (s.count || 0) : (s.previousCount || 0);
    }
    return counts;
  }
  const counts = {};
  for (const o of (prev && prev.offers) || []) {
    if (o.sourceName) counts[o.sourceName] = (counts[o.sourceName] || 0) + 1;
  }
  return counts;
}

module.exports = {
  NTB_HOTELS_STATIC, staticNtbHotelOffers, dedupe,
  parseExpiry, isExpired, floorCheck, carryForward, previousCounts,
};
