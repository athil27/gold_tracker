# Gold Price Tracker — Phase 1 implementation notes

## File structure (changed from single-file to 3 files, as requested)
```
index.html   — markup only
style.css    — all styling
app.js       — all logic (migration, fetch, computation, rendering, events)
sw.js        — service worker (updated asset list, cache-bump to v3)
manifest.json
icon-192.png, icon-512.png
```

## Deploy instructions
Upload **all 6 files** to the same GitHub Pages repo, replacing everything (the old
single `index.html` should be deleted or overwritten — don't leave both versions
side by side, since GitHub Pages serves whatever `index.html` sits at the root).

Because localStorage is scoped to the **origin+path**, not to individual file names,
your existing data (purchases, goals, settings, history) is already sitting there
under `athil27.github.io/gold_tracker/` and will be picked up automatically — no
manual export/import needed. The migration runs once, silently, on first load.

## Migration logic (in `app.js`, `runMigration()`)
Runs once per browser, gated by a `goldtracker_schema_version` flag so it never
re-runs or double-migrates:

| Old (v1) | New (v2) | Transform |
|---|---|---|
| `goldtracker_purchases` | `goldtracker_purchases_v2` | adds `id` (for edit/delete) + empty `notes` field to each record |
| `goldtracker_goal` (single object) | `goldtracker_goals_v2` (array) | wraps the old single goal as the first entry, `karatFilter: 'any'` |
| `goldtracker_buyThreshold` | `goldtracker_alerts_v2` (array) | seeds one `drop_vs_avg` alert rule using your old threshold, so existing alert behavior isn't lost |
| — | `goldtracker_primaryCurrency` | defaults to the first currency in your existing selected-currencies list |
| all premium/making-charge/weight/interval/currency-selection/history/log settings | unchanged | reused as-is, no transform needed |

If anything looks off after migration, the **Export data** button (Backup section)
lets you download the full state as JSON for safekeeping before you experiment.

## What's new

**Portfolio summary** — grouped by (currency, karat), never blended across currencies
or karats for money math, since ₹+₹ is valid but 22K-grams + 24K-grams isn't. Shows
avg buy price, current price, invested, current value, gain/loss (₹ and %). Current
value uses **local-market premium price, not jeweller-inclusive** — resale doesn't
recover making charges, so this is the more honest valuation.

**Purchase log** — now supports edit (pencil icon repopulates the form, button
becomes "Save changes") and delete, plus a free-text notes field per purchase.

**Alert manager** — three types, each independently enabled/disabled:
1. *Price drop vs 30-day average* (your original buy-signal, generalized)
2. *Price target reached* (above or below a number you set, per currency+karat)
3. *Goal milestone* (25/50/75/100% of a specific goal)

Each fires a notification only on the **transition** into a triggered state, not
every check while it stays triggered — avoids alert spam.

**Goals** — now multiple, each with a name, target weight, and an optional karat
filter (so a 22K-only goal doesn't count 24K purchases toward it, or vice versa).
Each shows owned grams, progress bar, estimated remaining cost at today's rate,
and a rough ETA based on your historical accumulation pace (grams/month since your
first purchase in that filter).

**Dashboard** — new top section: portfolio value + gain/loss (in your chosen
primary currency), total grams owned across everything, today's 24K/22K price,
and a mini progress bar for whichever goal is closest to completion.

**Stale-data warning** — a banner appears if the last successful price fetch is
older than 1.5× your configured refresh interval (minimum 30 min), so you're never
looking at old numbers without knowing it. The header also always shows
"Updated Xm/h ago" in plain language, ticking live.

## Known limitations (by design, not oversight)
- **No cross-currency conversion in the portfolio** — if you buy in both INR and
  SAR, you get two separate portfolio groups, not one blended number. Converting
  at today's rate would misstate what you actually paid in each currency at the
  time. This can be added later as an explicit "estimated combined value in
  [primary currency]" if useful, clearly labeled as an estimate.
- **Background reliability is still a browser-tab timer**, same constraint as
  before — this is a static, backend-free app, so there's no server to push
  notifications when the app/tab isn't running. If you need alerts to fire even
  when the app is fully closed for long periods, that's what the native Android
  build (Phase 0, separate deliverable) is for.
- **Alert evaluation runs only when a fetch happens** — same timer constraint as
  above.
