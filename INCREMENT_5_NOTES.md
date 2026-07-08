# Gold Tracker — Increment 5: Authentic price trend (gold-api.com history backfill)

Fifth implementation pass. Replaces the "wait for local history to build up"
Price Trend experience with a real 90-day trend from day one, sourced from
gold-api.com's `/history` endpoint — the same provider/domain the app
already uses for the live spot price — merged with the app's own in-app
check-in history rather than replacing it. `goldtracker_schema_version`
stays at 3; one new, purely additive localStorage key
(`goldtracker_trendCache`) is introduced.

## What changed

**1. Trend backfill fetch**
- `fetchTrendBackfill()` calls `https://api.gold-api.com/history/XAU?days=90`
  with the API key as an `x-api-key` header, caches the result in
  `goldtracker_trendCache` (`{ fetchedAt, days, points, source }`), and
  re-uses that cache for 24 hours before fetching again.
- **This is at most one API call per day per browser**, not per price
  check — the free tier is rate-limited to 10 requests/hour, and daily
  caching keeps real-world usage nowhere near that even shared across a
  handful of people using the app.
- Runs as fire-and-forget after the first paint (`init()`), so it never
  blocks the app from being usable — the existing in-app-only trend shows
  immediately, then upgrades to the backfilled version once the fetch
  resolves.

**2. Defensive response parsing**
- gold-api.com's `/history` documentation page is a JS-rendered SPA that
  couldn't be read through search/fetch tools, so the exact response field
  names aren't confirmed from their docs. `parseTrendHistoryResponse()`
  tries the array shapes (`data`, `data.history`, `data.prices`,
  `data.data`, `data.results`) and field names (`date`/`day`/`timestamp`
  for the date, `price`/`close`/`rate`/`value` for the value) that other
  price APIs in this space commonly use — same defensive spirit as the
  multi-fallback parsing `sw.js` already does for the price endpoint
  (`goldData.price ?? goldData.rate ?? ...`).
- **If the live response doesn't match any of these shapes, the fetch
  fails safely** — `fetchTrendBackfill()` catches the error, logs it, and
  leaves any existing cache in place rather than clearing it. The app
  falls back to exactly the Increment-4 behavior (in-app-only trend) until
  the shape mismatch is fixed. This is the one part of this increment I'd
  flag for a quick check once you're actually running it — if the trend
  chart doesn't show 90 days of pre-existing history after your first load,
  the response shape needs a one-line adjustment to
  `parseTrendHistoryResponse()`, not a rebuild.

**3. Merge, not replace**
- `getMergedHistory()` combines the backfill with your local in-app
  history: backfill covers every day *before* your first local check-in,
  local history covers everything from then on. No duplicate or
  conflicting same-day points, and today's price is always whatever you
  actually last saw in the app, not a cached daily close.
- On a fresh install with zero local history, the merged trend is 100%
  backfill — the full 90 days shows up immediately instead of "collecting
  data" for weeks.
- `computeBuySignal()`, `evaluateAlerts()`'s `drop_vs_avg` alert type, and
  the sparkline (`renderTrend()`) all switched from reading
  `Settings.getJSON('history', [])` directly to calling
  `getMergedHistory()` — so the trend backfill doesn't just fix the chart,
  it makes the 7-day/30-day averages behind Buy Signal and drop-vs-average
  alerts meaningful from day one too, not just after a few weeks of local
  checks accumulate.

**4. Trend section copy + label**
- The sparkline now renders up to 90 points (was 60) to actually show the
  full backfilled range.
- The badge next to "Price trend" reads *"90-day history (gold-api.com +
  live)"* when backfill data is present, falling back to the old
  *"N-day history (N checks)"* label if it isn't (e.g., backfill fetch
  hasn't resolved yet, or failed).
- Updated the now-inaccurate "History builds up as you use the app" subnote
  to state the actual source and refresh cadence, and updated the More →
  Data section's source line to mention the history endpoint alongside the
  existing live-spot and FX sources.

## A tradeoff worth stating plainly
The API key lives in `app.js` in plain text, visible to anyone who views
your page source. This is inherent to a static site with no backend — there's
nowhere else to put it — and was a deliberate, explicit tradeoff you signed
off on before this increment, not an oversight. If gold-api.com's free tier
or terms change in a way that makes this uncomfortable later, the fix is
either a backend proxy (Phase 4 territory per the monetization plan) or
dropping back to in-app-only history — `getMergedHistory()` already
degrades gracefully to that if the backfill cache is simply cleared or the
fetch is removed.

## What stayed exactly as-is
Everything from Increments 1–4: the 4-tab shell, persona reordering, the Add
Purchase bottom sheet, empty states, the trust panel under the comparison
teaser, settings groupings, and all portfolio/goal/alert computation logic
untouched by this pass. `saveHistoryPoint()` — how local in-app checks get
recorded — is completely unchanged; this increment only changes what gets
read alongside it.

## Not in this increment
No UI for manually re-triggering the backfill fetch or inspecting the cache
— if that turns out to be useful (e.g., a "force refresh trend data" button
next to the existing "Force refresh app" one), it's a small addition for a
later pass. No handling for a revoked/exhausted key beyond the existing
silent fallback to local-only history.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — the only misses (`goalsEmptyCta`, `portfolioEmptyCta`,
  `landedCostHomeCta`) are pre-existing, ids created and wired inside the
  same render call that writes their `innerHTML`.
- Cross-check of every inline `onclick="fn(...)"` in HTML against function
  declarations in JS — all resolve.
- HTML `<div>`/`<details>` tag-balance check — clean (146/146, 9/9).
- CSS brace-balance check — clean (167/167, unchanged this round — no CSS
  edits in this increment).
- No duplicate function declarations.
- **Not verified**: the actual shape of a live `/history` API response,
  since I couldn't authenticate a test call through available tools. First
  real load is the actual test — see the note in item 2 above.

## Migration
None needed for existing data. One new key,
`goldtracker_trendCache`, is additive with a safe fallback (`null` →
treated as "no backfill yet," merge function falls back to local-only
history). Every existing purchase, goal, alert, and setting carries over
untouched.
