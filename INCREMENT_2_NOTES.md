# Gold Tracker — Increment 2: Density correction + trust surfacing

Second implementation pass, built directly from the corrective build prompt in
`GoldTracker-Review-PostIncrement1.md`. No data model changes this round — pure
UI reorganization plus one architectural piece (Store) that was scoped to land
alongside it.

## What changed

**1. Collapsible forms (Portfolio + Alerts) — the core P0 fix**
- Portfolio → Goals: "+ Add" toggle in the section header, form closed by default.
- Portfolio → My Purchases: same pattern. Editing an existing purchase (✎) now
  opens the form automatically rather than assuming it's already visible.
- Alerts: the custom alert builder moved below "Your Alerts," behind a
  "+ Custom alert" toggle, closed by default. Presets stay always-visible above
  the alerts list, unchanged — they're the fast path and were already correctly
  prioritized in Increment 1.
- All three forms are functionally identical to Increment 1 — same fields, same
  validation, same submit logic. Only default visibility changed.

**2. Notification Health card (Alerts tab, new)**
- Sits above Presets — the first thing visible on the tab.
- Three facts, all reused from existing state (no new data source): notification
  on/off + permission state, last successful price check, and a one-line
  reliability caveat. This replaces relying on the footer disclaimer in More as
  the only place this information existed.
- Updates live when the notification toggle changes, not just on next full render.

**3. Spot / Retail / Jeweller price tier row (Home tab, new)**
- Replaced the two single-number "24K today" / "22K today" dashboard cards with
  a structural 4-column table (blank / Spot / Retail / Jeweller) × 2 rows (24K, 22K).
- This is the trust distinction elevated from "Reference" (More, 3 taps deep) to
  the first screen a user sees, as a permanent label row rather than a sentence
  they have to read once and remember.

**4. Store — first real use of the Repository/Store pattern**
- Added a ~15-line pub/sub (`Store.on` / `Store.emit`).
- `savePurchases()`, `saveGoals()`, `saveAlerts()` now each emit a change event
  internally. `init()` subscribes the render functions once, in one place.
- Removed the manual "call these 4 render functions after every mutation" chains
  that existed at every add/edit/delete call site in Increment 1 — each mutation
  site now just calls `save*()` and trusts the subscription to handle rendering.
- Scoped exactly as recommended: applied to Portfolio and Alerts data (the
  screens being restructured this round) rather than a bigger refactor across
  the whole app.

## What stayed exactly as-is (per the build prompt)
4-tab shell and `goToTab()`, karat model and purity factors, currency/karat chip
selectors, allocation bar, quick calculator, alert presets themselves (only their
position relative to the custom builder changed), all computation functions
(`computePortfolio`, `computeGoalProgress`, `evaluateAlerts`), migration/schema
versioning, service worker caching strategy (version bumped, logic unchanged).

## Not in this increment (unchanged from what was already out of scope)
Backend work, monetization gating, Partner-tier features, Digital Gold Locker
fields, onboarding walkthrough — all still pending, none blocked by this round.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against `index.html` — no
  mismatches (80 IDs referenced, all present).
- Cross-check of every inline `onclick="fn(...)"` in HTML against function
  declarations in JS — all resolve.
- CSS brace-balance check — clean.
- No duplicate function declarations.

## Migration
None needed — this increment changes UI structure and adds the Store layer, but
doesn't change what's stored in localStorage or its shape. Existing purchases,
goals, alerts, and settings carry over with no transform.
