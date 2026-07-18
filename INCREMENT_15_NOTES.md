# Gold Tracker — Increment 15: Price Context density + Portfolio group clutter

Two targeted UI fixes, no data model or Worker changes. `goldtracker_schema_version`
stays at 3; `purchases`/`goals`/`alerts`/`trip`/`persona` untouched.

## What changed

**1. Price Context card (Home) — confidence + track record moved inside
the disclosure.**

Previously the card stacked six things in the always-visible tier: label,
numbers, chips, a confidence/freshness line, a track-record sentence, and
*then* a collapsed "How the signal is computed" disclosure below all of
it. Increment 9's stated intent was "numbers primary, meta secondary,"
but confidence and track record never actually moved into a secondary
(collapsed) tier — they were just muted with color.

Now: label → numbers → chips is the only always-visible tier (the actual
decision-relevant content). Confidence, track record, and the methodology
paragraph are all inside one renamed disclosure: "Confidence, track
record & methodology ▾".

`renderPriceContext()` in `app.js` needed **no changes** — it still
targets `#priceContextConfidence` and `#priceContextTrack` by id; only
their position in the DOM moved (`index.html`), plus their CSS spacing
(`style.css`, since they're no longer top-level flow elements with their
own top margins against the chips row).

**Persona default-open logic updated** (`applyPersonaOrder()`): the
Investor persona used to see confidence/track unconditionally (via
`.detail-forward` styling, never hidden). Now that they're inside the
disclosure for everyone, Investor also defaults the disclosure open —
preserving that persona's prior "always visible" experience rather than
newly hiding it. Buyer keeps its existing open-by-default (unchanged
reasoning from Increment 9: buyer visits rarely with high intent, needs
the reasoning without a tap). NRI/no-persona still default closed.

**2. Portfolio groups — collapsible, title + gain/loss visible by default.**

The actual source of Portfolio summary's density wasn't the six top-level
sections (three were already collapsible `<details>` since Increment 9)
— it was `renderPortfolio()`: every karat×currency group rendered a title
plus 5 always-open rows (avg buy price, current price, invested, current
value, gain/loss). Two or three groups (e.g. 22K-INR, 24K-INR, 22K-SAR)
meant 15+ rows permanently on-screen with no way to collapse any of it.

Each group is now a `<details class="portfolio-group">`. The summary row
shows the title (karat/currency/count/grams) and gain/loss — the two
things actually glanced at day to day. The other four rows (avg buy
price, current price, invested, current value) sit inside, collapsed by
default, same one-tap pattern as Allocation/Comparison/Landed cost
elsewhere in this tab.

## What was deliberately left alone

- The top Portfolio summary line (`renderPortfolioSummaryLine()`) — still
  one line, still the orientation point before the sections below. Not
  touched; it wasn't the density source.
- Allocation by karat, India vs Saudi comparison, Landed cost — already
  collapsible since Increment 9, no changes.
- Goals and Purchase log sections — not flagged as dense, left as-is.
- No change to how `computePortfolio()` groups or calculates anything —
  purely a display-layer change to `renderPortfolio()`'s output markup.

## Verification done before packaging

- `node --check app.js` — clean.
- `node --check worker.js` (as `.mjs`) — clean (worker.js untouched this
  round, checked anyway per convention).
- `$('id')` cross-check against static `index.html` ids — same three
  pre-existing dynamic exceptions (`goalsEmptyCta`, `portfolioEmptyCta`,
  `landedCostHomeCta`), no new ones introduced.
- Every inline `onclick="fn(...)"` resolves to a real function — clean.
- `<div>`/`<details>` tag-balance — 133/133, 15/15 (was 133/133, 15/15
  before this increment; the new `<details class="portfolio-group">`
  elements are generated dynamically by `app.js`, not present in static
  `index.html`, so they don't move this count).
- CSS brace-balance — 172/172 (was 169/169; +3 net from the new
  `.portfolio-group-summary` rules and the removed/merged confidence
  line, matches the diff).
- No duplicate function declarations.
- `sw.js` `CACHE_NAME` bumped v17 → v18; footer version string in
  `index.html` bumped to v1.15 (Increment 15).

## Not included in this delivery

`manifest.json` and the icon files weren't part of what was shared back
into this session, so they're not re-shipped here — they're unchanged
and untouched by this increment regardless. Same for `DEPLOYMENT.md`.
If you want the full file set reconciled in one place, let me know and
attach those too next time.

## Known open items, unchanged by this increment

Everything from `PROJECT_STATE_SUMMARY.md` still stands except CORS,
which you already confirmed working in production (live price + Price
Context both render correctly on load) — that item can be marked
resolved. Still open: retail-price accumulation surfacing decision, app
naming, monetization mechanics, accessibility audit, and the two
independent price-fetching paths (`app.js` vs `sw.js`'s background
check).
