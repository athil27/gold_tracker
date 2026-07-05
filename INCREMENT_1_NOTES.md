# Gold Tracker — Redesign Increment 1: Foundation + Navigation Shell

This is the first implementation pass against `GoldTracker-Phase1-Redesign-Spec.md`.
It covers the pieces everything else depends on — later increments (visual polish,
onboarding, skeleton loaders, quick-calculator refinement) build on top of this
without needing to touch the data model or navigation again.

## What's in this increment

**1. Numeric karat model (spec §7.1)**
- `PURITY_FACTOR = {18: 0.750, 21: 0.875, 22: 0.9167, 24: 0.999}` replaces the old
  hardcoded 22K/24K-only branching that existed in four separate places.
- Karat is stored as a `Number` everywhere (purchases, goals, alerts) — migration
  (`schema v2 → v3`) converts old string values (`'22'`, `'24'`) automatically.
- Price computation now generates spot/premium for **all four karats** per
  currency (`prices[code].spot[18|21|22|24]`, `.prem[...]`), not just two. Old
  flat fields (`spot24`, `prem22`, etc.) are kept as aliases so existing
  dashboard/comparison/log code didn't need to change.
- New "Karats to show" chip selector (More → Settings) controls which karats
  appear in the price grid, same interaction pattern as the existing currency chips.

**2. 4-tab navigation shell (spec §1–2)**
- Home / Portfolio / Alerts / More, bottom tab bar on mobile.
- Section-to-tab mapping follows the spec's table exactly (dashboard + condensed
  price/comparison/trend → Home; portfolio summary + goals + purchases →
  Portfolio; alerts → Alerts; settings + backup + reference + log → More).
- Full price grid, full India/Saudi comparison, and the trend chart live in
  `<details>` expandable sections on Home per the "avoid long scrolling" directive
  — collapsed by default, one tap to expand.
- `goToTab()` is a plain show/hide over existing DOM (no router, no page reload)
  — appropriate for a 4-screen static app; revisit only if navigation depth grows.

**3. New features from the spec, scoped for this increment**
- **Allocation by karat** (Portfolio) — stacked bar computed from purchase
  records, tap a segment to filter the purchase list below by that karat.
- **Quick calculator** (Home) — grams + karat → today's value at both
  local-market and jeweller-inclusive price, using the primary currency.
- **Alert presets** (Alerts) — "3%+ dip", "5%+ dip", "goal milestones" one-tap
  buttons that create the underlying alert rule(s) via the existing alert engine.
- **Alerts tab badge** — a dot appears on the Alerts tab when an alert has fired
  since it was last opened.

## What's deliberately NOT in this increment (see roadmap below)

- Visual design-system pass (§4): color/type/spacing tokens exist informally in
  CSS already; formalizing them as named custom properties, auditing contrast
  ratios, and fixing sub-44px tap targets (the ✕ delete icons) is the next
  visual-only pass — didn't want to mix structural changes with cosmetic ones
  in the same diff.
- Onboarding walkthrough, skeleton loaders, offline/error states (§UX
  improvements) — Home/Portfolio/Alerts currently show empty states but not
  loading skeletons; the app is fast enough on first load that this is lower
  priority than the structural work above, but it's a real gap for a "premium
  feel" product and should be the next increment after the visual pass.
- Digital Gold Locker fields (item name, making charge paid, invoice image
  placeholder) — data model change, additive and low-risk, deliberately
  deferred so this increment stays reviewable as "navigation + karat model"
  rather than growing into "everything at once."
- Repository/Store architectural layering (spec §5.1) — the current code still
  calls `localStorage` directly from render functions. This matters more once
  the codebase is bigger; introducing it now, before the visual pass, would mean
  touching every render function twice (once for the layer, once for the redesign).
  Recommend doing this refactor right before Phase 2 (cloud sync) work starts,
  since that's when it actually pays for itself.
- Freemium scaffolding (`Entitlements`, §9.3) — no gated features exist yet, so
  there's nothing to scaffold against. Add this when the first premium-only
  feature is actually being built, not before.

## Migration notes (v2 → v3)

Runs automatically, once, on first load after deploying this version:
- `goldtracker_purchases_v2[].karat`: string → Number
- `goldtracker_goals_v2[].karatFilter`: string ('22'/'24') → Number, 'any' stays 'any'
- `goldtracker_alerts_v2[].karat`: string → Number (goal_milestone alerts have no
  karat field and are untouched)
- New key `goldtracker_karats`: seeded to `[22, 24]` (matches the pre-redesign
  display defaults, so nothing visually changes for existing users until they
  deliberately open Settings and add 18K/21K)

As before: **export your data (More → Data → Export) before this deploy**, same
recommendation as every prior migration — this one's low-risk (purely additive +
type coercion, no field renames or deletions) but the habit is worth keeping.

## Next increment (recommended)

Visual design-system pass (§4 of the spec): formalize color/spacing/type tokens,
fix tap targets, add tabular-nums everywhere numbers appear (partially done in
this increment — new components have it, older ones like the purchase table
don't yet), and do the elevation-tier pass on hero vs. default cards.
