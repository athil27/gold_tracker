# Gold Tracker — Increment 7: Price Context (Buy Signal redesign)

Seventh implementation pass. Replaces the flat-threshold Buy Signal card
with the redesigned "Price Context" from the trust review: volatility-
adjusted thresholds instead of fixed percentages, actual numbers instead of
just a label, confidence tied to real data coverage, and a bounded track
record. No data model changes — `goldtracker_schema_version` stays at 3, no
new localStorage keys. This is a computation and UI redesign built entirely
on data the app already collects (merged history from Increments 5–6).

## What changed

**1. Renamed: Buy Signal → Price Context**
Per the explicit "don't overclaim" constraint — this is a statistical
comparison to recent history, not a prediction, and the name now says so.
Every id/class/function renamed accordingly (`buySignalCard` →
`priceContextCard`, `computeBuySignal()` → `computePriceContext()`, etc.) —
grepped for and confirmed zero leftover references.

**2. Volatility-adjusted thresholds (z-scores), not flat percentages**
The old version asked "is today >3% below the 30-day average" — a fixed
bar regardless of how volatile gold has actually been. The new
`zScoreFor()` computes the standard deviation of daily % changes within
each window and expresses today's gap in standard deviations instead of
raw percent. `bandFromZ()` bands on that z-score (>1.5σ = "notably below,"
0.5–1.5σ = "mildly below," etc.), falling back to the old flat-%
thresholds only when there's too little data to compute volatility
honestly — a safety net, not the primary path.

**3. Three-horizon confluence, not a single cherry-picked window**
`combineHorizons()` compares the 7-day and 30-day bands: if they agree on
direction, the label is whichever is more extreme (stronger signal from
agreement). If they disagree, the honest output is **"Mixed"** — stated
plainly rather than forcing one side. The 90-day figure is now computed too
(made possible by the Increment 5/6 backfill) and shown as a third
reference chip, though it doesn't currently participate in the confluence
logic itself.

**4. Confidence tied to real data coverage**
`computePriceContextConfidence()` — High/Medium/Low based on how many real
days are actually in the 30-day window and whether the gold-api.com
backfill succeeded, not asserted uniformly regardless of how much real
data backs the read. A read built on 4 days of local-only history (the
honest pre-Increment-6 state) now visibly says so, instead of looking as
confident as one built on 90 real days.

**5. Track record — bounded, not decorative**
`computeTrackRecord()` scans the full merged history for prior days that
landed in the *same* band as today, and reports what fraction were higher
a week later. **Below 5 comparable instances, it renders nothing** —
`MIN_TRACK_RECORD_SAMPLE = 5` is a hard floor. A missing number is more
honest than a percentage built on 2–3 instances dressed up as evidence, per
the explicit anti-fake-precision constraint. Also skipped entirely for
"Typical" or "Mixed" bands, since "similar to today" isn't a meaningful
comparison in either of those states.

**6. Actual numbers on the card, not just a verdict**
`usdOzToGram()` converts today's spot and the 30-day average into a
per-gram price in the user's primary currency (at today's FX/premium — the
app has no historical FX/premium series, so this is a consistent
"translated at today's rate" figure, same honesty convention already used
by the India-vs-Saudi comparison). Shown as: *"Spot ≈ ₹9,850/g (22K) ·
30-day avg ≈ ₹9,790/g."* Reason chips (`7d: −1.1%` `30d: −2.6%` `90d:
−0.4%`) let someone see exactly which horizon is driving the label without
reading prose.

**7. Method disclosure, freshness, and honest framing on the card itself**
A `<details>` block ("How this is read ▾") states plainly: *"A statistical
comparison of today's spot price to its own recent trailing averages — not
a prediction, and not AI-generated."* The confidence line always shows
freshness ("Updated 12m ago") directly on the card, not buried elsewhere.

## A deliberate simplification worth stating plainly

The recommendation asked for distinct spot-based and local-retail signals.
Built as designed, they'd be **mathematically identical in their %
delta/z-score/label** — the app only has one real historical series (USD
per troy ounce), and converts it to local currency using *today's* FX rate
and premium uniformly across the whole series (see `usdOzToGram()`'s
comment). Scaling a series by a constant factor doesn't change its
percentage moves. So rather than build a second card that implies an
independently-computed retail signal that doesn't actually exist yet, this
increment shows **one signal, with a secondary translated-currency number**
— honest about the constraint instead of manufacturing false
differentiation. A genuinely divergent retail signal would need a stored
historical series of retail prices (not just spot), which is backend
territory — noted for a future pass, not built here.

The Landed Cost (NRI) card is unaffected and intentionally uses none of
this vocabulary — it was already positioned as a decision aid, not a
timing signal, per the original Increment 4 design, and that separation
holds.

## What stayed exactly as-is
`getMergedHistory()`, the trend backfill and its 24h cache, `evaluateAlerts()`'s
`drop_vs_avg` alert type (still uses the older flat `rollingAverage()`
comparison — not in scope for this pass, though it could adopt the same
z-score logic in a future increment), the sparkline, personas, empty
states, the bottom sheet, and everything else from Increments 1–6.

## Not in this increment
- Retail-specific signal divergence (needs stored historical retail
  prices — backend territory, Phase 3 in the monetization plan).
- Applying the new z-score/confluence logic to `drop_vs_avg` alerts (same
  underlying math, different call site — a small follow-up, not done
  here to keep this pass scoped to the card itself).
- Longer lookback than 90 days (bounded by the free-tier history endpoint,
  same constraint noted in Increment 5/6).

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — same three pre-existing dynamic-id exceptions as prior
  increments, no new ones.
- Cross-check of every inline `onclick="fn(...)"` in HTML — all resolve.
- Grepped for every remaining `buySignal`/`BuySignal`/`buy-signal`
  reference across `app.js`, `index.html`, and `style.css` — zero left.
- HTML `<div>`/`<details>` tag-balance check — clean (149/149, 10/10).
- CSS brace-balance check — clean (174/174).
- No duplicate function declarations.

## Migration
None needed — no data model or key changes. The redesigned card reads the
same `history` and `trendCache` data Increments 3–6 already established;
nothing to migrate or backfill differently.
