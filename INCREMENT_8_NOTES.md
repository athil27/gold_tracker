# Gold Tracker — Increment 8: Homepage redesign (decision cockpit, not dashboard)

Eighth implementation pass, built from the homepage review. Implements the
P0 and P1 changes plus two cheap P2 items. No data model changes —
`goldtracker_schema_version` stays at 3, no new localStorage keys. This is
entirely a hierarchy and persona-conditional-visibility pass on top of
computation that already existed.

## What changed (P0)

**1. Removed the duplicate India vs Saudi fact.** The `dashCmpMini` mini-stat
inside the portfolio block showed the same delta as the comparison teaser
above it, just smaller. Deleted outright — one instance of this fact on
Home now, not two competing for attention.

**2. Portfolio value demoted from hero to a compact line.** The old
`dash-hero` block (32px hero number + separate gain/loss line + a
standalone "Total weight owned" dash-card) is gone. In its place: one
`.holdings-line` — *"10.5g owned · ₹1,03,250 +5.2%"* — sized like
supporting information, not the biggest thing on the page. Total weight
owned is folded into this same line instead of getting its own card.

**3. Actions reframed.** "Add Purchase" → **"Log a purchase"** (record-
keeping language, not transactional). "Set Alert" → **"Alert me on moves
like this"** — ties the action to Price Context above it through wording,
since physically relocating the button into that card would have cluttered
it.

**4. Landed Cost is now persona-conditional on Home.** `renderLandedCost()`
now branches: the **NRI** persona still gets the full card (empty-state
teaser or progress bar, unchanged). **Buyer and Investor** personas get a
single quiet line instead — *"Bringing gold home? → Track allowance"* — no
big empty-state block, no CTA button, just a link. The Portfolio tab's
Landed Cost section is completely unaffected by persona; it's a deliberate
destination, not something that needs to earn its space the way Home does.

## What changed (P1)

**5. Top Goal removed from Home as a permanent section.** The old "Top
goal" block (header, progress bar, "View all" link, shown every time
regardless of relevance) is gone. Replaced by `renderGoalNudge()` — a
single line that **only renders when your best-progressing goal is ≥75%
complete** (`GOAL_NUDGE_THRESHOLD_PCT`). Below that, nothing shows. Full
goal management remains exactly where it already was, in Portfolio.

**6. Quick Calculator moved into the collapsed reference tier.** Was a
permanently-open `.section`, competing visually with Price Context for
top-of-screen space despite being an occasional-use tool. Now a
`<details class="section-details">`, first among the three collapsed
sections (Quick calculator → All prices & currencies → Price trend) — same
tier as the other reference material, not artificially elevated.

**7. Holdings + actions + goal nudge consolidated into one quieter unit**
inside `portfolioBlock`, visually and structurally distinct from the Tier-1
decision cockpit above it (Price Context + comparison teaser).

## What changed (P2 — cheap, included)

**8. Price Trend defaults open for the Investor persona.** Trend-watching
is more central to that persona's use of the app; `applyPersonaOrder()` now
also sets `priceTrendDetails.open = (persona === 'investor')`. Every other
persona still gets it collapsed, same as before.

**Not done (P2, deliberately skipped):** the synthesized single-sentence
combination of Price Context + India-vs-Saudi facts. The review itself
flagged real risk of this reading as guidance it isn't, and recommended
treating it as optional polish rather than a priority — left it out rather
than build something that undercuts the "not advice" discipline the rest
of the app maintains.

## Recommended section order, as built

1. Price Context (unchanged content)
2. India vs Saudi teaser (unchanged content, now the only instance)
3. Landed Cost — full card (NRI) or one-line teaser (everyone else)
4. Holdings line + empty state
5. Log a purchase / Alert me on moves like this
6. Goal nudge (conditional, ≥75% only)
7. — collapsed below —
8. Quick calculator
9. All prices & currencies
10. Price trend (open by default for Investor)

Persona reordering (`PERSONA_ORDER`) still controls the relative position
of the four `card-stack` blocks exactly as in Increment 4 — this pass adds
*visibility* logic (Landed Cost, goal nudge) on top of the existing
*position* logic, it doesn't replace it.

## Cleanup

Removed now-dead CSS: `.dash-hero`, `.dash-grid`, `.dash-card`,
`.dash-value-lg`, `.dash-value-sm`, `.dash-value`, `.dash-gainloss` (+
variants), and the `.dash-grid` mobile media-query rule — all were only
used by markup this increment removed. `.dash-label` was kept; it's still
used by the NRI Landed Cost card's inline header.

## What stayed exactly as-is
Price Context's internal computation and card content (Increment 7),
the India-vs-Saudi comparison's math (`renderComparison()`), the Landed
Cost trip data model and Portfolio-tab form, all persona-order
infrastructure from Increment 4, the Add Purchase bottom sheet, empty
states elsewhere in the app, and everything else not explicitly listed
above.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — same three pre-existing dynamic-id exceptions
  (`goalsEmptyCta`, `portfolioEmptyCta`, `landedCostHomeCta`), no new ones.
- Explicitly scanned for stale references to every removed id
  (`dashPortfolioValue`, `dashGainLoss`, `dashValueWrap`, `dashGoalMini`,
  `dashCmpMini`, `dashGrams`) across both files — zero remaining.
- Cross-check of every inline `onclick="fn(...)"` in HTML — all resolve.
- HTML `<div>`/`<details>` tag-balance check — clean (134/134, 11/11).
- CSS brace-balance check — clean (168/168).
- No duplicate function declarations.

## Migration
None needed — no data model or key changes. Every existing purchase, goal,
alert, persona choice, and trip carries over untouched; this increment only
changes what Home shows and to whom.
