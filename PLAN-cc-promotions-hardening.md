# PLAN: Harden cc-promotions data pipeline

## Executor instructions

You are implementing against repo `PnxLasantha/cc-promotions` (default branch: `master`).
Work strictly in the order given. Each task lists acceptance criteria — do not move to the next task until the current one's criteria pass. Use TDD where a task has unit-testable logic: write the failing test first, then implement.

**Hard constraints:**
- Do NOT add new npm dependencies. Use Node's built-in test runner (`node:test` + `node:assert`). Node 22 is already the workflow runtime.
- Do NOT attempt to fix the NTB hotel-page 403 / scrape the NTB hotel page. That is explicitly out of scope (see Non-goals).
- Do NOT redesign the frontend. Only the minimal UI change specified in Task 6.
- Do NOT change the offers.json top-level shape consumed by index.html (`{ updatedAt, offers: [...] }`). New fields may be added to offer objects; nothing may be removed or renamed.
- Preserve the existing single-file simplicity philosophy where possible; the only structural change permitted is extracting pure logic into `lib.js` (Task 1) so it is testable without Playwright.

## Context (current state)

- `scrape.js` (197 lines): single IIFE. Scrapes 3 sources with Playwright (NTB promotions page, Amex dining + lodging, Seylan dining + local-travel with pagination). Then appends a **hardcoded array of ~64 NTB hotel offers** (page returns 403), dedupes by `card|merchant`, writes `offers.json`.
- `.github/workflows/scrape.yml`: cron `0 0,12 * * *`, plus `push: branches: [main]` — **dead trigger, branch is `master`**. Commits `offers.json` via github-actions bot.
- `index.html`: static page, fetches `offers.json`, renders cards, shows `updatedAt` timestamp.
- No tests. No error handling around individual scrapers. No expiry logic anywhere.

### Known defects this plan fixes
1. **Expired offers served as live.** ~16 offers in current `offers.json` have validity dates in the past (some from Nov 2025), all from the hardcoded block. `updatedAt` is re-stamped every run, so stale data carries a fresh timestamp.
2. **Silent partial failure.** A bank markup change → empty selector results → script exits 0 → smaller offers.json committed, no alert. Conversely one thrown error kills all banks for that run.
3. **Dead push trigger** (`main` vs `master`).
4. **Lossy dedup.** Key `card|merchant` drops a second distinct offer at the same merchant.
5. **Hardcoded data indistinguishable from scraped data** in output and UI.

### Real validity string formats (from live offers.json — parser must handle all)
```
"Valid till 31st July 2026"
"Valid till  31st August 2026"          (double space)
"Valid from 1st July to 31st August 2026"
"Valid every Sat from 1st July to 31st August 2026"
"Valid on Mondays from 1st of July 31st July 2026"
"Valid from 3rd to 19th July 2026"      (day-only first date)
"Until 31 Oct 2026"                     (abbreviated month, no ordinal)
"Stays until 31 Aug 2026"
"1–31 Jul 2026"                         (en dash range)
"1 Apr – 31 Oct 2026"
"11 May – 30 Nov 2026"
"Special rates from LKR 45,000"          (no date at all — must not crash)
""                                       (empty string exists)
```

## Goals

1. Expired offers never reach the rendered app.
2. A scraper failure (thrown error OR suspicious low count) is loud: red workflow run + email, while healthy banks' fresh data still ships.
3. Hardcoded/static data is labeled as such in data and UI, and expires like everything else.
4. Regression tests exist and run in CI before commit.

## Non-goals (do not touch)

- Fixing the NTB hotel page 403 (separate spike; requires interactive experimentation).
- Adding new banks.
- PDF/image-poster offer extraction.
- Any persistence layer beyond offers.json in git.
- Frontend redesign, filters, or personalization features.

---

## Task 1 — Extract pure logic into `lib.js` (refactor, no behavior change)

Create `lib.js` exporting pure functions; `scrape.js` requires it. Move (verbatim behavior for now):
- the dedup logic → `dedupe(offers)`
- the hardcoded NTB hotels array → `NTB_HOTELS_STATIC` constant (data only; mapping to offer objects becomes `staticNtbHotelOffers()`)

**Acceptance:**
- `node scrape.js` still produces byte-equivalent `offers` array content vs. before refactor (timestamps aside). Verify by running the old and new dedup against a fixture of the current offers.json and diffing.
- No Playwright import in `lib.js` (must be requireable in a test with no browser).

## Task 2 — Validity date parser (TDD)

Add to `lib.js`:

```
parseExpiry(validityString) -> Date | null
isExpired(validityString, now = new Date()) -> boolean
```

**Spec:**
- Extract the **last** date occurrence in the string. Supported date shapes:
  - `DD(st|nd|rd|th)? <FullMonthName> YYYY` (e.g. `31st July 2026`)
  - `DD <AbbrevMonth> YYYY` (e.g. `31 Oct 2026`)
- Tolerate multiple spaces, "of", weekday noise, en dashes, "till/until/to" variants — the last-date rule makes these irrelevant, do not special-case them.
- Expiry semantics: offer is valid **through end of that day** (23:59:59 local). `isExpired` returns true only if `now` is strictly after end of expiry day.
- No parseable date (`null`) → `isExpired` returns **false** (fail-open: never drop an offer because we couldn't read its date).
- Year without explicit day/month never occurs; do not guess partial dates.

**Tests (write first):** one assertion per format listed in Context above, plus: empty string → not expired; `"Until 30 Jun 2025"` with now=2026-07-06 → expired; `"Valid till 31st July 2026"` with now=2026-07-31 → NOT expired; same with now=2026-08-01 → expired.

**Wire-up:** in `scrape.js`, after dedup, filter `offers.filter(o => !isExpired(o.validity))`. Log count of dropped-expired per card.

**Acceptance:** running against the current committed `offers.json` as fixture drops ≥ the known ~16 expired entries and zero entries with future dates.

## Task 3 — Fix dedup key (TDD)

Change key from `card|merchant` to `card|merchant|offer` (all lowercased/trimmed).

**Tests:** two offers, same card+merchant, different offer text → both kept. Exact duplicates → one kept. Case/whitespace variants of the same triple → one kept.

## Task 4 — Per-bank isolation + floor check + carry-forward

Restructure the main run in `scrape.js`:

1. Define sources as an array: `{ name: 'ntb-credit' | 'amex' | 'seylan', run: async (page) => offers[] }` (amex and seylan runs internally do their two categories).
2. Wrap each source in try/catch. On throw: record failure, continue to next source.
3. **Floor check:** before writing, load previous `offers.json` (if present) and compute previous count per source. If a source succeeded but returned `< 50%` of its previous count **and** previous count ≥ 10, treat it as failed (markup drift is the likely cause).
4. **Carry-forward:** for every failed source, reuse that source's offers from the previous `offers.json` (they still pass through the Task 2 expiry filter, so carried-forward offers age out).
5. Each offer gets a `source` field (`'scraped'` for live, `'carried'` for carry-forward, `'static'` for the hardcoded hotels — see Task 5) and each run writes a top-level `sourceStatus` object: `{ [sourceName]: { status: 'ok'|'failed'|'floor', count, previousCount } }`.
6. **Exit code:** if any source failed/floored, print a clear summary and `process.exit(1)` — but only AFTER writing `offers.json`. The workflow (Task 7) still commits.

**Tests:** floor-check function is pure — extract as `floorCheck(newCount, prevCount)` in `lib.js` and test: (4, 100) → fail; (60, 100) → ok; (2, 5) → ok (prev < 10 guard); (0, 0) → ok. Carry-forward merge logic also extracted pure and tested.

**Acceptance:** simulate a failure (temporarily point one URL at a 404 in a local run) → other sources' fresh data present, failed source's data carried from previous file, exit code 1, `sourceStatus` reflects it.

## Task 5 — Label the hardcoded NTB hotel block honestly

- All offers from `staticNtbHotelOffers()` get `source: 'static'` and `sourcedAt: '<date of last manual fetch — use the date the array was added in git history>'`.
- They pass through the same expiry filter (this alone removes the Nov-2025 zombies).
- Add a top-level `staticSourcedAt` field to offers.json.

**Acceptance:** generated offers.json contains no static offer with a past validity date; every static offer carries `source: 'static'`.

## Task 6 — Minimal UI honesty changes (index.html)

Two changes only:
1. Offers with `source: 'static'` render a small muted badge: `data as of <staticSourcedAt>`.
2. If any entry in `sourceStatus` is not `'ok'`, render one banner line under the timestamp: `⚠ <bank> data may be stale (last good fetch carried forward)`.

**Acceptance:** open index.html locally against a fixture offers.json exercising both states; badge and banner render; normal state renders neither.

## Task 7 — Workflow fixes (.github/workflows/scrape.yml)

1. `push: branches: [main]` → `[master]`.
2. Add `npm test` step after `npm ci`, **before** Playwright install (unit tests need no browser). Test failure blocks the scrape.
3. Scrape step: allow the job to continue to the commit step even when `node scrape.js` exits 1. Use `continue-on-error: false` is wrong here — instead give the scrape step an `id`, run it with `continue-on-error: true`, commit as normal, then add a final step `if: steps.scrape.outcome == 'failure'` that does `exit 1` so the run is red and notifications fire **after** the commit has been pushed.

**Acceptance:** workflow YAML passes `actionlint` if available, otherwise careful manual review; logic order is test → install browser → scrape → commit → fail-if-scrape-failed.

## Task 8 — Data validation test (runs in CI against generated file)

Add `test/validate-offers.test.js` runnable standalone (`node --test test/`), skipped gracefully if `offers.json` absent:
- schema: every offer has non-empty `bank`, `card`, `merchant`, `category` ∈ {Dining, Hotel}, `source` ∈ {scraped, carried, static}
- no offer has a parseable validity date in the past
- total offers ≥ 100 (tripwire, tune later)
- no duplicate `card|merchant|offer` triples

This test is NOT in the pre-scrape `npm test` (file may be stale there); add a separate workflow step running it after `node scrape.js` and before commit. If it fails, do NOT commit — bad data must not ship.

## Verification (run before declaring done)

```
npm test                         # all unit tests green
node scrape.js                   # exit 0 on healthy run; offers.json written
node --test test/                # includes validate-offers against fresh file
grep -c '"source": "static"' offers.json    # > 0
node -e "const d=require('./offers.json'); if(!d.sourceStatus) process.exit(1)"
```

Manual: open index.html with a doctored offers.json containing one `carried` source and confirm the banner; confirm static badge on NTB hotel cards.

## Human gates

- **Gate after Task 2:** show the list of offers the expiry filter drops from the current offers.json before wiring the filter in permanently. (Guards against a parser bug silently deleting live offers.)
- **Gate after Task 7:** show the final workflow YAML diff before push — CI changes are cheap to get wrong and expensive to debug at cron time.

## Definition of done

All 8 tasks' acceptance criteria pass; both human gates approved; one full GitHub Actions run (manual `workflow_dispatch`) completes with green tests, committed offers.json, zero expired offers in the committed file.
