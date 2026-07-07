# Gold Tracker — Increment 4: Phase 1 rollout (persona onboarding, decision-surface reorder, trust layer, language pass)

Fourth implementation pass, built from the approved mockup and the Phase 1
scope in the monetization strategy ("Reposition — frontend-only, current
architecture, no monetization yet"). No paywalls, no locked features, no
backend — this increment is entirely about how the app presents itself, not
what it charges for. `goldtracker_schema_version` stays at 3; the v3
migration is untouched. Two new, purely additive localStorage keys
(`goldtracker_persona`, `goldtracker_trip`) are introduced — neither is read
by the migration, so old installs pick up sensible defaults automatically.

## What changed

**1. Persona onboarding**
- A centered modal (`#personaOverlay`), distinct from the Add Purchase
  bottom sheet — this is a one-time-ish preference, not a repeated action,
  so it doesn't get the slide-up treatment.
- Three plain-language choices — *Buying gold*, *Tracking it as an
  investment*, *NRI, buying to bring home* — stored as a single flag,
  `Settings.get('persona', '')`.
- Shown automatically on first launch (`getPersona()` returns `''`).
  Dismissible via the ✕ without picking — this is a preference, not a gate,
  so declining just means the app keeps the neutral buyer-order default and
  asks again next launch, exactly as the modal's own copy promises
  ("Change it anytime in More").
- Revisitable anytime from **More → Display → Persona → Change**.

**2. Home reorder by persona**
- The four existing Home blocks — Buy Signal, the India-vs-Saudi teaser, the
  new Landed Cost card, and the portfolio-value block (hero + price tier row
  + weight/comparison mini-cards + Add Purchase/Set Alert actions + top
  goal) — now live inside one flex container, `#homeCardStack`
  (`.card-stack { display:flex; flex-direction:column; }`).
- `applyPersonaOrder()` sets `style.order` on each block per
  `PERSONA_ORDER[persona]` — a pure CSS reorder, zero DOM reshuffling, zero
  duplicated markup:
  - **Buyer**: Buy Signal → comparison → portfolio → landed cost
  - **Investor**: Buy Signal → portfolio → comparison → landed cost
  - **NRI**: comparison → landed cost → Buy Signal → portfolio
- Quick Calculator, the "All prices & currencies" accordion, and the Price
  Trend accordion stay below the stack, unreordered, for everyone — these
  are reference material, not decision surfaces, per the repositioning
  strategy's distinction between the two.

**3. Landed Cost (NRI) — new card, deliberately minimal**
- New Home card and a matching Portfolio section, both backed by a single
  `goldtracker_trip` object (`{ allowanceGrams, gramsBrought, updatedAt }`)
  — one active trip, not a ledger. Full multi-trip tracking with per-traveler
  aggregation is NRI Pro (Phase 3 in the monetization plan) and is
  explicitly out of scope here.
- Empty state (no trip set up) reuses the same `.empty-state` pattern from
  Increment 3's empty states, with a "Set up your first trip" CTA that
  jumps to Portfolio and opens the edit form directly
  (`openLandedCostFromHome()`).
- Once a trip exists, both the Home card and the Portfolio section show the
  same progress bar (reusing the existing `.progress-wrap`/`.progress-bar`
  component from Goals) — grams used vs. allowance, plus a one-line
  remaining-allowance note.
- The allowance figure is **user-entered, not hardcoded** — the form asks
  for it directly rather than assuming a specific traveler category, and
  the subnote points to the existing Reference section (which already
  carries the male/female duty-free figures with the "verify at cbic.gov.in"
  caveat) rather than duplicating or re-deriving legal specifics here.

**4. Trust layer — "How we calculate this"**
- An inline `<details>` under the Home comparison teaser (reusing the
  generic `details` styling already in the stylesheet, just tightened
  slightly for its nested context) — no new expand/collapse JS needed.
- `renderComparison()` now also writes into `#trustMethodologyText`, stating
  the actual configured premiums by name: *"Spot price plus India's 14% and
  Saudi's 4% premiums (editable in Settings), converted at today's exchange
  rate. Doesn't account for your actual remittance rate or transfer fees."*
  The numbers are live — if someone changes their premium assumptions in
  Settings, the trust copy reflects it on the next render, so it can't drift
  out of sync with what the app is actually computing.

**5. Language pass**
- Every section `<h2>` moved from `ALL CAPS` to sentence case: "Quick
  calculator," "Allocation by karat," "Portfolio summary," "Notification
  health," "Your alerts," "Settings," "Data," "Reference," "Recent checks,"
  etc. "India vs Saudi" keeps its proper-noun capitalization.
- "My Purchases" → "Purchase log" — ownership language dropped in favor of
  naming what the section actually is.
- Button copy passed for verb-first, sentence-case, no Title Case, no
  exclamation marks: "Add Purchase" → "Add purchase," "Set Alert" → "Set
  alert," "Check Price Now" → "Check price now," "Edit Purchase" (sheet
  title when editing) → "Edit purchase."
- Fixed a latent inconsistency from Increment 3: `.settings-group summary`
  had `text-transform: uppercase` in its CSS, which was silently
  re-uppercasing "Display / Notifications / Pricing assumptions" even
  though the HTML already had them in sentence case. Removed the
  transform so the rendered text matches the source.
- Left the header wordmark ("◆ GOLD TRACKER") as-is — that's brand/logo
  treatment, not an instruction or action label, so it's outside the scope
  of the UI-copy pass.

## What stayed exactly as-is
4-tab shell and `goToTab()`, karat model and purity factors,
currency/karat chip selectors, the Add Purchase bottom sheet mechanics
(Increment 3), collapsible Goals/Alerts forms, allocation bar, quick
calculator computation, Buy Signal computation (Increment 3), all portfolio
math (`computePortfolio`, `computeGoalProgress`, `evaluateAlerts`), the
`Store` pub/sub, migration/schema versioning, and the service worker's
caching strategy (version bumped to v7, network-first-for-app-shell logic
unchanged).

## Not in this increment
Any monetization mechanics (tiers, license keys, locked features) —
correctly out of scope per the phased plan, which puts monetization in
Phase 2. Multi-trip landed-cost tracking, remittance-rate alerts, and
multi-country comparison are NRI Pro (Phase 3). Cross-device sync and
reliable background push remain backend-required (Phase 4).

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — the only misses (`goalsEmptyCta`, `portfolioEmptyCta`,
  `landedCostHomeCta`) are ids created and wired inside the same render call
  that writes their `innerHTML`, same pattern as Increment 3's empty-state
  CTAs.
- Cross-check of every inline `onclick="fn(...)"` in HTML against function
  declarations in JS — all resolve.
- HTML `<div>`/`<details>` tag-balance check — clean (146/146, 9/9).
- CSS brace-balance check — clean (167/167).
- No duplicate function declarations.

## Migration
None needed for existing data. Two new keys are additive and read with
safe fallbacks: `goldtracker_persona` defaults to `''` (triggers onboarding,
falls back to buyer ordering in the meantime), `goldtracker_trip` defaults
to `null` (renders the landed-cost empty state). Every existing purchase,
goal, alert, and setting carries over untouched.
