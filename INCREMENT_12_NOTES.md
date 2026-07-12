# Gold Tracker — Increment 12: All Prices & Currencies moved to More

Small, targeted change: relocated the "All prices & currencies" section
from Home to More → Reference. No data model changes —
`goldtracker_schema_version` stays at 3, no new localStorage keys, no
logic touched.

## What changed

**Moved, not duplicated.** The full price grid (`priceCardsGrid`), the
spot-price full card (`spotUsd`, `spotTopLine`), and the "Check price now"
button all moved as a single unit from Home's collapsed reference tier
into More → Reference, as a new fourth `<details>` item — **"All prices &
currencies — today's numbers ▾"** — positioned right after "Spot vs retail
vs jeweller price — what's the difference?"

**Why Reference specifically, not Portfolio:** this content is a lookup
tool, not a decision surface or a portfolio-management task — it doesn't
fit either of those tabs' actual purpose. More → Reference already
explains the spot/retail/jeweller distinction conceptually; this section
is the live-data version of that same explainer, so it completes an
existing thought instead of sitting somewhere unrelated. Home keeps only
what's actually decision-relevant (Price Context, the comparison, Landed
Cost, holdings) plus the two remaining reference items that are still
Home-adjacent by function (Quick Calculator, Price Trend) — this one
wasn't, so it moved.

**One copy fix caught in the process.** The "pick at least one currency
and karat" empty-state message inside `renderPriceCards()` said "in
Settings **below**" — accurate when this card sat in Home, above Settings
in tab order. Now that it lives in More, *after* Settings, "below" was
backwards. Fixed to "in Settings **above**."

## Verification done before packaging
- Confirmed `priceCardsGrid`, `spotUsd`, and `spotTopLine` each appear
  exactly once in `index.html` post-move — not duplicated, not orphaned.
- Confirmed `renderPriceCards()` in `app.js` is fully tab-agnostic (reads
  by id only, no assumptions about which tab it's rendered into) — no
  logic changes needed, only the copy fix above.
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids —
  same three pre-existing dynamic-id exceptions, no new ones.
- Cross-check of every inline `onclick="fn(...)"` — all resolve.
- HTML `<div>`/`<details>` tag-balance check — clean (133/133, 14/14).
- CSS brace-balance check — clean (169/169, no CSS changes this round).
- No duplicate function declarations.

## What stayed exactly as-is
Everything else in Home's collapsed tier (Quick Calculator, Price Trend),
all of Portfolio, Alerts, and the rest of More. This was a single-section
relocation, not a broader reorganization.

## Migration
None needed — no data model or key changes, purely a markup relocation.
