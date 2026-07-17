# Gold Tracker — Increment 14: Price/signal moved to the Worker

The big one. `app.js` now sources the live price and the entire Price
Context signal from the Cloudflare Worker (`gold-tracker-api.athilapps.workers.dev`)
instead of computing everything client-side. This is what the last several
increments were building toward: the exposed API key is gone from the
client, and the cross-device consistency bug (Increments 10-11) is fixed
at its actual root — one shared computation, not two devices each
approximating their own. `goldtracker_schema_version` stays at 3; the
`purchases`/`goals`/`alerts`/`trip`/`persona` data model is completely
untouched. What changed is entirely the price/signal layer.

## What changed

**1. `fetchGoldPrice()` tries the Worker first, falls back to direct APIs.**
`GET /api/price` gives `{ usdPerOz, fx, timestamp }`; the existing
per-currency/per-karat price computation (unchanged math) now runs on
that instead of on direct `gold-api.com`/`open.er-api.com` responses. If
the Worker is unreachable, it falls back to exactly the old direct-fetch
behavior — the live price stays resilient to Worker downtime.

**2. New `fetchSignal()` replaces the entire client-side Price Context
engine.** `GET /api/signal` returns the fully-computed signal — label,
numbers, confidence, track record, and the 90-day history used to
compute it. `renderPriceContext()` now just formats that response; it no
longer computes anything.

**3. No client-side fallback for the signal specifically — deliberately.**
If the Worker can't be reached, Price Context shows "unavailable," not a
locally-recomputed approximation. Building a fallback engine would have
silently reintroduced the exact cross-device divergence this Worker
exists to eliminate — two devices, two different "temporary" answers,
right back where Increments 10-11 started. Better to say nothing than to
say something that might disagree with what another device says.

**4. `evaluateAlerts()`'s `drop_vs_avg` type now reads `lastSignal.avg30`**
instead of a separately-computed local rolling average — one 30-day
average used everywhere in the app, not two that could theoretically
disagree with each other.

**5. `renderTrend()` (the sparkline) now plots `lastSignal.history`**
directly, and its label simplified — there's no more "backfill vs. local
checks" distinction to describe, since there's only one source now.

## What got deleted, not just replaced

This wasn't a like-for-like swap — a lot of code became genuinely
unnecessary and was removed outright, not left dormant:

- `GOLD_API_KEY` — the exposed client-side key. **Gone from `app.js`
  entirely.** It lives only in the Worker's encrypted secret now, never
  shipped to a browser.
- `fetchTrendBackfill()`, `parseTrendHistoryResponse()`, `TREND_DAYS`,
  `TREND_CACHE_MAX_AGE_MS`, the `goldtracker_trendCache` key — the whole
  Increment 5/6 backfill-fetching apparatus. The Worker does this now.
- `getMergedHistory()`, `collapseToOnePerDay()`, `dateStrToMs()` — the
  Increment 10/11 merge-and-precedence logic. No longer needed once
  there's only one canonical history, not a per-device approximation of
  one.
- `zScoreFor()`, `bandFromZ()`, `combineHorizons()`,
  `computePriceContextConfidence()`, `computeTrackRecord()`,
  `windowPoints()`, `dailyChanges()`, `stddev()`, `BAND_META`,
  `BAND_ORDER`, `DAY_MS`, `MIN_TRACK_RECORD_SAMPLE`,
  `computePriceContext()` — the entire Increment 7 signal-computation
  engine. This math still exists, verified as a byte-for-byte port, just
  in `worker.js` now instead of `app.js`.
- `saveHistoryPoint()` and the local `goldtracker_history` key — nothing
  reads local per-device check-in history anymore, so the app stopped
  writing it. `rollingAverage()` — its only caller (`evaluateAlerts`) now
  reads the Worker's `avg30` instead.

Net effect: `app.js` is meaningfully smaller, and an entire category of
"is this computed correctly on this specific device" bugs became
structurally impossible rather than something to keep testing for.

## Two things intentionally left alone

- **`sw.js`'s background notification check** (`checkGoldPriceAndNotify()`)
  still calls `gold-api.com`'s unauthenticated price endpoint directly —
  it never used the exposed key in the first place (no `/history` call,
  no key needed), and it doesn't touch Price Context at all. Out of scope
  for this pass; flagging it rather than silently leaving it unmentioned.
- **`sw.js`'s fetch handler** was updated to exclude `workers.dev` URLs
  from its cache-passthrough logic, same as the existing `gold-api.com`/
  `er-api.com` exclusions — caught while reviewing the file, not
  something that would have silently broken anything, but worth fixing
  while touching this area.

## An honest gap in verification

Everything tested so far — `/api/price`, `/api/signal`, both endpoints
individually — was tested by *navigating* directly to the URLs in a
browser tab. That proves the Worker itself works. It does **not** prove
that a cross-origin `fetch()` call *from* `app.js`, running on
`athil27.github.io`, actually succeeds against the Worker's CORS headers
— navigation and fetch are different browser code paths, and CORS only
applies to the latter. The Worker's code does set
`Access-Control-Allow-Origin: '*'` on every response, which should cover
this correctly — but "should" isn't "verified," and this exact category
of gap (assuming a contract instead of testing it) is what caused two
extra rounds of debugging back in Increments 5-6. Worth a real end-to-end
test once this is deployed, not just trusting the CORS header is doing
what it's supposed to.

## Verification done before packaging
- `node --check` on both `app.js` and `worker.js` — clean.
- Full sweep for every symbol removed (`GOLD_API_KEY`,
  `getMergedHistory`, `fetchTrendBackfill`, `collapseToOnePerDay`,
  `zScoreFor`, `bandFromZ`, `combineHorizons`, `computeTrackRecord`,
  `windowPoints`, `dailyChanges`, `stddev`, `BAND_META`, `BAND_ORDER`,
  `MIN_TRACK_RECORD_SAMPLE`, `rollingAverage`, `saveHistoryPoint`,
  `parseTrendHistoryResponse`, `dateStrToMs`, `trendCache`,
  `Settings.getJSON('history'...)`) across `app.js` — zero live
  references remain; only one explanatory code comment mentions the old
  names by name.
- Found and fixed one straggler during the sweep: `renderTrend()`'s label
  logic still checked the now-defunct `trendCache` key to decide its
  wording — simplified now that there's only one history source.
- Full cross-check of every `$('id')` reference in JS against static ids
  in `index.html` — same three pre-existing dynamic-id exceptions
  (`goalsEmptyCta`, `portfolioEmptyCta`, `landedCostHomeCta`), no new
  ones.
- Cross-check of every inline `onclick="fn(...)"` — all resolve.
- HTML `<div>`/`<details>` tag-balance check — clean (133/133, 15/15).
- CSS brace-balance check — clean (169/169, no CSS changes this round).
- No duplicate function declarations.

## Migration
None needed for `purchases`/`goals`/`alerts`/`trip`/`persona` — completely
untouched. `goldtracker_history` and `goldtracker_trendCache` are simply
no longer written or read; existing values in those keys are harmless,
inert leftovers that can stay in `localStorage` indefinitely with zero
effect, or be cleared by the existing Export/Import flow's "Force
refresh" if you want a clean slate. Nothing user-facing needs to change on
existing installs beyond the code update itself.
