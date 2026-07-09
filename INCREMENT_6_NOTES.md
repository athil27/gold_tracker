# Gold Tracker — Increment 6: Trend backfill API contract fix

Fixes the Price Trend backfill shipped in Increment 5, which was silently
failing on the live site. No new features, no data model changes —
`goldtracker_schema_version` stays at 3, no new localStorage keys. Pure bug
fix, found by live-debugging the real endpoint since gold-api.com's
`/history` docs page couldn't be read through available tools.

## What was wrong

Increment 5 guessed the endpoint contract (`/history/XAU?days=90`) since
the docs page is a JS-rendered SPA. The guess was wrong in three ways,
found by testing directly against the live API in your browser console:

1. **Wrong path/params.** The real endpoint is `/history` (not
   `/history/XAU`), and takes `symbol`, `startTimestamp`, and
   `endTimestamp` as query parameters — not a `days` count. First test
   returned `400 {"error": "startTimestamp is required."}`.
2. **`symbol` needed explicitly.** Even with the symbol seemingly implied
   by the old path, the real endpoint wants `symbol=XAU` as its own query
   param. Second test returned `400 {"error": "symbol is required."}`.
3. **Default aggregation is yearly, not daily.** Without a `groupBy`
   param, the endpoint collapses the whole range into one row per year
   (`[{"max_price":"4886.000000","year":"2026"}]`) — useless for a 90-day
   trend. Needed `groupBy=day` explicitly.

The confirmed working request:
```
GET https://api.gold-api.com/history?symbol=XAU&startTimestamp={unix}&endTimestamp={unix}&groupBy=day
Header: x-api-key: {your key}
```
returning, most-recent-first:
```json
[{ "day": "2026-07-08 00:00:00", "max_price": "4134.700200" }, ...]
```

**One thing worth knowing going forward:** this is the day's *high*, not a
closing price — the free tier doesn't expose OHLC/close separately. Fine
for a trend line, but if the sparkline looks a touch more jagged/peaky than
a close-based chart would, that's why, not a bug.

**Good news buried in the debugging:** CORS was never the problem. The
`x-api-key` header was accepted fine and every test reached the server and
got a real HTTP response — the failures were plain parameter-contract
mismatches, all fixable client-side, no proxy/backend workaround needed.

## What changed

- `fetchTrendBackfill()` now builds the correct URL: computes
  `startTimestamp`/`endTimestamp` as Unix seconds (90 days apart), and
  requests `symbol=XAU&...&groupBy=day` instead of the old `/history/XAU?days=90`
  guess.
- `parseTrendHistoryResponse()` now reads the confirmed `day`/`max_price`
  fields first (still falls back to the other field-name guesses from
  Increment 5 defensively, in case the shape differs for other query
  combinations or changes later).
- Everything downstream — `getMergedHistory()`, `computeBuySignal()`,
  `evaluateAlerts()`'s `drop_vs_avg` type, `renderTrend()` — is unchanged;
  they were already written against the internal `{date, usdPerOz}` /
  `{t, usd}` shapes, not the raw API response, so fixing the parser and
  fetch URL was the entire fix.

## What stayed exactly as-is
The 24-hour cache window, the merge-with-local-history logic, the silent
fallback-on-failure behavior, the trend label copy, and everything from
Increments 1–4. This is a contained fix to two functions.

## Verification done before packaging
- Confirmed against the **live API**, not guessed — the exact request/response
  shape above came from three rounds of testing directly against
  `api.gold-api.com` in a real browser session, not documentation.
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — same three pre-existing dynamic-id exceptions as prior
  increments, no new ones.
- Cross-check of every inline `onclick="fn(...)"` in HTML — all resolve.
- HTML `<div>`/`<details>` tag-balance check — clean (146/146, 9/9).
- CSS brace-balance check — clean (167/167, unchanged — no CSS edits this round).
- No duplicate function declarations.

## Migration
None needed — no data model or key changes. Existing `goldtracker_trendCache`
entries from a failed Increment 5 fetch will simply be replaced by a
correct one on the next load (cache had nothing valid in it to lose, since
Increment 5's fetch never actually succeeded).
