# Gold Tracker — Increment 3: Buy signal, comparison teaser, bottom sheet, settings grouping, empty states

Third implementation pass. No data model changes this round — every item below
is UI/UX reorganization or a purely-derived computation on top of data that
already exists (price history, purchases, goals). `goldtracker_schema_version`
stays at 3; the v3 migration is untouched.

## What changed

**1. Buy Signal card (Home, above the portfolio-value teaser)**
- New `computeBuySignal()` reuses the exact same `history` array and
  `rollingAverage()` helper the sparkline already relies on — no new data
  source, no chart, just a plain-language read on today's spot vs. its 7-day
  and 30-day trailing averages.
- Evaluated in this order: **Good buy window** (today >3% below the 30-day
  avg) → **Good dip** (>1.5% below the 7-day avg) → **Wait** (>2% above the
  30-day avg) → **Neutral** (anything else, i.e. within roughly ±1.5–2% of
  both).
- The percentage gap is computed once in USD/troy-oz terms (same basis
  `evaluateAlerts()` already uses for `drop_vs_avg` alerts), since the ratio
  is identical across every currency and karat — 22K is used only as a
  familiar label in the reason text, not as a separate calculation.
- Rendered as a single colored card (`.buy-signal-card.good/.neutral/.bad`)
  with a label + one-line reason. No chart, no new SVG.
- Hidden entirely (`display:none`) until there's enough history for both
  averages, same "collecting data" spirit as the existing sparkline.

**2. India vs Saudi: Home teaser + relocated full comparison**
- Home no longer carries the full `<details>` comparison accordion. In its
  place: a single line (`#cmpTeaserText`) with a plain-language delta, e.g.
  *"India is ~2.3% cheaper than Saudi right now (22K)"*, plus a "Full detail
  →" link.
- The full accordion — India retail, Saudi-converted-to-₹, the result line,
  and the FX-rate caveat — moved as-is into the **Portfolio** tab as its own
  section ("INDIA VS SAUDI — FULL COMPARISON"), no longer collapsed behind a
  `<details>` toggle since Portfolio is already a deeper/more deliberate tab.
- `renderComparison()` is the same function computing the same numbers; it
  now also writes the one-line teaser alongside what it already wrote to
  `dashCmpMini` and the (relocated) full-detail elements. No new fetch, no
  new computation — same `cmpIndia`/`cmpSaudi`/`cmpResult` ids, just fed from
  two locations in the DOM instead of one.

**3. Add Purchase as a bottom sheet**
- The purchase form (`#purchaseFormWrap`) moved out of the Portfolio tab's
  inline flow and into a global overlay at the end of `<body>`, styled as a
  slide-up bottom sheet with a backdrop (`#purchaseSheetBackdrop`).
- Every field, id, and the validation/submit logic in `wirePurchaseForm()`
  is untouched — grams/price/karat/currency/jeweller/notes, edit-vs-add
  branching via `editingPurchaseId`, all identical to Increment 2. Only the
  container and the show/hide mechanism changed: `openPurchaseForm()` /
  `closePurchaseForm()` now toggle an `.open` class (driving a CSS
  `transform: translateY()` transition) instead of `style.display`.
- Three ways in: Portfolio's existing "+ Add" button (`togglePurchaseForm`,
  unchanged wiring), the Home "Add Purchase" CTA (now calls a new
  `openAddPurchaseSheet()` directly instead of switching tabs first — the
  sheet is a global overlay, so it doesn't need Portfolio to be the active
  tab), and the pencil/edit icon on an existing purchase row (now sets the
  sheet's title to "Edit Purchase" instead of scrolling the page to the old
  inline form location, since an overlay makes that scroll unnecessary).
- Closes via its own ✕ button, a tap on the backdrop, or the existing
  Cancel button — all three call the same `resetPurchaseForm()` +
  `closePurchaseForm()` pair already used in Increment 2.

**4. Settings grouping (More tab)**
- The previously flat list under "SETTINGS" is now three `<details>` groups,
  same visual language as the existing REFERENCE accordions:
  - **Display** — currencies to show, karats to show, primary currency
    (open by default, since it's the most commonly touched group).
  - **Notifications** — on/off toggle, check interval, price-card weight
    unit, and "Next check" countdown (grouped with interval since it's the
    direct consequence of that setting).
  - **Pricing assumptions** — India/Saudi/other premiums and the making
    charge.
- No settings were added, removed, or renamed — every input keeps its exact
  id, so `loadSettingsIntoForm()`, `wireSettingsForm()`,
  `populatePrimaryCurrencyOptions()`, `renderCurrencyChips()`, and
  `renderKaratChips()` needed zero changes.

**5. Empty states (Home + Portfolio)**
- **Home / portfolio value**: instead of the text "No purchases logged yet"
  sitting where a number used to be, `renderDashboard()` now toggles between
  `#dashValueWrap` (the number + gain/loss) and `#dashEmptyState` (a short
  message + a "+ Add your first purchase" button wired to
  `openAddPurchaseSheet()`).
- **Portfolio → Portfolio Summary**: `renderPortfolio()`'s empty branch now
  renders a message + CTA (same sheet trigger) instead of a bare subnote.
- **Portfolio → Goals**: `renderGoals()`'s empty branch renders a message +
  "+ Add your first goal" CTA that opens the existing inline goal form
  (`openGoalForm()`) and focuses the name field — goals stay an inline form,
  not a sheet, since only Add Purchase was in scope for the sheet treatment.
- **Portfolio → My Purchases**: a new `#purchasesEmptyState` block (icon +
  message + CTA) replaces the previous behavior of just hiding the table
  with nothing in its place.
- All empty-state CTAs that live as static markup in `index.html`
  (`dashEmptyCta`, `purchasesEmptyCta`) are wired once in a new
  `wireEmptyStates()`, called from `init()`. The two that are generated
  inside a render function's own `innerHTML` (portfolio summary, goals) wire
  their listener immediately after being written, same pattern already used
  elsewhere in the file (e.g. the `.del`/`.edit` handlers in
  `renderPurchases()`).

## What stayed exactly as-is
4-tab shell and `goToTab()` (aside from the Home Add-Purchase button no
longer routing through it), karat model and purity factors, currency/karat
chip selectors, allocation bar, quick calculator, alert presets and the
custom alert builder's collapsible behavior, all computation functions
(`computePortfolio`, `computeGoalProgress`, `evaluateAlerts`,
`rollingAverage`), the `Store` pub/sub and its Portfolio/Alerts
subscriptions, migration/schema versioning, and the service worker's caching
strategy (version bumped to v6, network-first-for-app-shell logic
unchanged).

## Not in this increment
Backend work, monetization gating, Partner-tier features, Digital Gold
Locker fields, onboarding walkthrough — all still pending, none blocked by
this round.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — the only two misses (`goalsEmptyCta`, `portfolioEmptyCta`)
  are ids created and wired inside the same render call that writes their
  `innerHTML`, by design (same pattern as the pre-existing `.del`/`.edit`
  handlers).
- Cross-check of every inline `onclick="fn(...)"` in HTML against function
  declarations in JS — all resolve, including the new
  `openAddPurchaseSheet()`.
- HTML `<div>`/`<details>` tag-balance check — clean (130/130, 8/8).
- CSS brace-balance check — clean (148/148).
- No duplicate function declarations.

## Migration
None needed — this increment is UI structure, a client-side buy-signal
computation, and container/visibility changes only. `goldtracker_purchases_v2`,
`_goals_v2`, `_alerts_v2`, and every settings key keep the exact same shape;
existing data carries over with no transform.
