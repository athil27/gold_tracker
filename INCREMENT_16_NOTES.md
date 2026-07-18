# Gold Tracker — Increment 16: Retail Context signal

Builds the "Retail Context" second signal decided on for the retail-price
data that's been silently accumulating since Increment 14. Touches
`worker.js` (new computation, same endpoint) and `app.js`/`index.html`/
`style.css` (new Home card). No changes to `purchases`/`goals`/`alerts`/
`trip`/`persona`; `goldtracker_schema_version` stays at 3.

## Design decisions made (per your answers)

- **Placement:** Home, immediately after Price Context — not Portfolio
  (which we just decluttered) and not a separate spot further down.
- **Scope:** always both INR and SAR, regardless of primary currency
  setting. This data exists for cross-border comparison; showing only
  one currency would defeat the reason it was collected.

## What changed — Worker

**`computeRetailSignals()` is not a new engine — it's a reshape + reuse.**
Z-scores and bands operate on percentage deltas, so they don't care what
unit the series is in. `computeRetailSignals()` maps `retail_history`'s
`{t, price}` points to the `{t, usd}` shape `computeSignal()` already
expects, and calls that exact function — the same one spot's signal has
used since Increment 7/14. Zero new math to verify; `computeSignal(` now
has two call sites and one definition (confirmed by grep before
packaging). `history` is stripped from each currency's result before
attaching to the response — `retail_history` has no TTL and grows
forever, and there's no retail sparkline built yet to justify shipping
that array in every `/api/signal` response, indefinitely.

**`accumulateRetailHistory()` now returns the per-currency history map**
instead of void, so `refreshSignal()` can compute the retail signal from
the same data without a second KV read.

**`refreshSignal()` reordered:** retail accumulation used to be
fire-and-forget *after* the `signal` KV write. It's now awaited *before*
that write, since the retail signal needs to be part of the same cached
object `/api/signal` returns. This is a real behavior change worth
flagging, not just a refactor: if `accumulateRetailHistory()` were to
hang, the main signal write would now wait on it too. In practice this
is low-risk — the function already wraps its body in try/catch and
resolves `null` on any failure rather than throwing or hanging — but
it's a different failure shape than before, so noting it explicitly
rather than leaving it implicit in a diff.

**`/api/signal`'s response shape gains one field:**
```
{
  ...(unchanged spot signal fields)...,
  retail: {
    INR: { today, band, meta, delta7, avg7, delta30, avg30, delta90, avg90, confidence, trackRecord } | null,
    SAR: { ...same shape... } | null
  } | null
}
```
`retail` is `null` if accumulation failed that round; each currency is
`null` individually if there's not yet any history for it (e.g. FX
didn't include that currency on a given day). Both cases degrade the
same way the existing engine already handles sparse spot data — no new
"insufficient data" logic was needed, `computeSignal()`'s existing
confidence-tier and track-record floor (≥5 samples) already return calm,
honest partial results rather than errors.

## What changed — Client

**New card, `index.html`:** "Retail context" sits directly below Price
Context on Home. Two rows (India, Saudi), each showing a band label,
today's representative retail price + 30-day average, and 7/30/90-day
chips — the same primary tier Price Context uses. A single shared
disclosure below both rows ("Confidence, track record & methodology ▾")
holds each currency's confidence/track-record line plus one methodology
paragraph that states the premium assumption plainly (14% India, 4%
Saudi) and repeats the existing "not a prediction, not AI-generated"
framing — required per the project's hard constraint on that language,
not optional here just because it's a new feature.

**`renderRetailContext()` / `renderRetailRow()`, `app.js`:** Note this
renders more directly than `renderPriceContext()` does — retail's
`ctx.today`/`avgN` values are already per-gram retail prices in their
currency (computed server-side with the premium baked in), unlike spot's
`ctx.today` (USD/oz, needs `usdOzToGram()` client-side conversion). No
unit conversion needed here.

**Wired into all three existing `renderPriceContext()` call sites**
(`fetchSignal()`, `renderAll()`, `applyPersonaOrder()`) so it stays in
sync with Price Context rather than needing its own separate refresh
trigger.

**`PERSONA_ORDER` updated:** `retailContextCard` added immediately after
`priceContextCard` in all three personas' order maps, so "near Price
Context" placement holds regardless of which persona reorders the rest
of the card stack.

**Disclosure defaults closed for every persona** — deliberately different
from Price Context's disclosure (which defaults open for Buyer/Investor).
This is a new secondary signal, not the primary one every persona already
expects to see; there's no prior "always visible" experience to preserve
here the way there was when Price Context's confidence/track moved inside
its own disclosure last increment.

## What was deliberately left alone

- No trend/sparkline for retail data — `history` is explicitly stripped
  from the API response this round. If a retail sparkline gets built
  later, that's a separate decision (the raw history is still being
  accumulated in KV regardless, just not shipped over the wire yet).
- Landed Cost wasn't touched — retail Context is a standalone signal,
  not feeding into the landed-cost calculation, per the direction chosen.
- No change to `sw.js`'s background notification path — still its own
  independent gold-api.com call, unrelated to this signal, same known
  gap flagged since Increment 14.

## Verification done before packaging

- `node --check app.js` — clean.
- `node --check worker.js` (as `.mjs`) — clean.
- Confirmed `computeSignal(` has exactly one definition and two call
  sites (spot + retail) via grep — the "reuse, don't rewrite" claim
  above is verified, not just asserted.
- `$('id')` cross-check — same three pre-existing dynamic exceptions
  (`goalsEmptyCta`, `portfolioEmptyCta`, `landedCostHomeCta`), no new
  misses despite ~10 new ids added for the retail card.
- Every inline `onclick="fn(...)"` resolves — clean.
- `<div>`/`<details>` tag-balance — 148/148, 16/16 (was 133/133, 15/15;
  +15 divs and +1 details matches the new card's markup).
- CSS brace-balance — 180/180 (was 172/172; +8 matches the new rule
  block).
- No duplicate function declarations in `app.js` or `worker.js`.
- `sw.js` `CACHE_NAME` bumped v18 → v19; footer version bumped to v1.16
  (Increment 16).

## Not included in this delivery

Same as last time: `manifest.json`, icon files, and `DEPLOYMENT.md`
weren't part of this session's uploads, so they're not re-shipped —
unchanged and untouched by this increment regardless.

## An honest gap

The retail signal's actual usefulness right now depends entirely on how
many days `retail_history` has accumulated since Increment 14 was
deployed — that's real-world elapsed time this session has no visibility
into. If it's still early, expect "Low confidence" and no track record
on both rows for a while; the engine handles that gracefully rather than
erroring, but it's worth knowing going in rather than treating a sparse
first look as a bug.

## Known open items, unchanged by this increment

App naming, monetization mechanics, accessibility audit, and the two
independent price-fetching paths (`app.js` vs `sw.js`'s background
check) — all still open, none touched here.
