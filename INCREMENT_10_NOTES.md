# Gold Tracker — Increment 10: Cross-device consistency fix

Fixes a real bug found via a live side-by-side comparison (laptop vs
phone, same moment): the same spot price produced different Price Context
labels — "Mildly below recent range" vs "Mixed" — on two devices. No data
model changes — `goldtracker_schema_version` stays at 3, no new
localStorage keys. One function fixed at its source, benefiting every
consumer automatically.

## What was wrong

`getMergedHistory()` combines rarely-fetched backfill (gold-api.com,
identical data regardless of device) with frequently-updated local
check-in history (accumulated per-device, independently, at whatever
frequency that specific device happened to check the price). Two real
bugs fell out of this:

1. **Uneven statistical weighting.** A device that checked the price 10
   times on a given day contributed 10 data points to that day in the
   30-day average and volatility calculation; a device that checked once
   contributed 1. Same real market prices, mathematically different
   averages and different volatility — which feeds directly into the
   z-score bands, so the same day could read as "notably below" on one
   device and "typical" on another purely from check frequency, not
   anything about gold.
2. **"Days of data" counted data points, not days.** `daysOfData` in the
   confidence line was `windowPoints(hist, Date.now(), 30).length` — a
   raw count of points inside a 30-day window, which can (and did, per the
   screenshots) exceed 30 if a device made more than one check on some
   days. "58 days of data" inside a 30-day window is a logical
   impossibility that a careful user can catch, exactly as happened here.

Both bugs trace to the same root cause, so one fix addresses both.

## What changed

`collapseToOnePerDay()` — new function, collapses any point series down to
one point per calendar day (the latest reading of that day, when there are
multiple). `getMergedHistory()` now runs its output through this before
returning, regardless of whether the points came from backfill or local
checks.

Because `getMergedHistory()` is the single source every consumer reads
from, this fix applies everywhere at once, with no other functions
touched: `computePriceContext()` (the card itself), `computePriceContextConfidence()`
(the "days of data" line — now genuinely counts distinct days, capped
sensibly at the window size), `computeTrackRecord()`, `evaluateAlerts()`'s
`drop_vs_avg` alert type, and `renderTrend()` (the sparkline, which now
also plots one point per day uniformly across its whole range instead of
dense-then-sparse depending on how recently a stretch was covered by local
checks vs. backfill).

## An honest limit on how far this goes

This fix removes the *provably wrong* part — uneven weighting and an
impossible day-count — and brings devices much closer together. It does
not make output byte-identical across devices, and that's worth being
upfront about rather than overselling:

- Each device's `trendCache` still refreshes independently on its own
  24-hour clock, so at any given moment one device's backfill snapshot can
  be up to a day fresher than another's.
- For days covered by local checks (after each device's personal first-check
  date) rather than backfill, "the latest reading of that day" can still
  differ slightly device-to-device if their last check that day happened
  at different times.

Both residual effects are far smaller than the bug just fixed, and
self-correct within about a day as caches refresh. **Getting to genuinely
identical output on every device would require computing the signal
server-side from shared state** — which is backend territory (this
mirrors the "cross-device sync needs auth + a database" limitation already
flagged in the monetization roadmap's Phase 4, not a new constraint
introduced here).

## What stayed exactly as-is
Every function downstream of `getMergedHistory()` — `zScoreFor()`,
`bandFromZ()`, `combineHorizons()`, `computeTrackRecord()`'s sampling
logic, the trend backfill fetch and its 24h cache. This was a one-function
fix; nothing else needed to change because everything else was already
correctly built on top of whatever `getMergedHistory()` returned — the bug
was entirely in what it returned, not in how it was used.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Confirmed all four real call sites of `getMergedHistory()`
  (`computePriceContext`, `evaluateAlerts`, and two `renderTrend` calls)
  receive the fix automatically, with no changes needed at those call
  sites.
- Full cross-check of every `$('id')` reference in JS against static ids —
  same three pre-existing dynamic-id exceptions, no new ones.
- No duplicate function declarations.

## Migration
None needed — no data model or key changes. Existing `history` and
`trendCache` data is read exactly as before; this only changes how it's
processed before statistics run on it. On your next load, both the laptop
and phone should converge toward much closer numbers — not necessarily
identical to the decimal, for the reasons above, but no longer showing
contradictory labels for the same live price.
