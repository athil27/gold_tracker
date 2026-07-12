# Gold Tracker — Increment 11: Cross-device consistency, the actual fix

Increment 10 fixed a real bug (same-day check-ins overweighting a device's
own statistics) but didn't fix the reported symptom — verified live via a
side-by-side incognito-laptop vs. phone comparison on the deployed site,
both running v1.10, still showing different labels for the same live
price. This increment fixes the actual root cause. No data model changes —
`goldtracker_schema_version` stays at 3, no new localStorage keys.

## What Increment 10 got right, and what it missed

Increment 10's fix (collapsing multiple same-day points into one) was
necessary and correct — it stopped a device with frequent check-ins from
overweighting its own recent days. But it operated on top of a precedence
rule that was still wrong: **local history took over from a device's
first-ever check onward, with backfill only filling in days *before*
that.**

That meant two devices could source the *same calendar day* from two
structurally different things:

- A long-used device (weeks of local history): any day after its first
  check used **that device's own local reading** for that day.
- A fresh device (incognito, zero local history): every day used
  **gold-api.com's actual daily high** for that day.

De-duplicating same-day points (Increment 10) doesn't help when the
disagreement is about *which source represents the day at all*, not how
many points from that source got counted.

## The actual fix

Flipped the precedence in `getMergedHistory()`: **backfill is now
authoritative for every day it covers**, since it's the same shared
gold-api.com data on every device (modulo up to ~24h of independent cache
staleness). Local history now only fills in the gap *newer* than the most
recent backfill point — in practice, just "today," or "today and
yesterday" if a device's backfill cache hasn't refreshed recently.

```
Before: backfill for days before your FIRST-EVER local check,
        local for everything from then on (weeks of divergence)

After:  backfill for every day it has data for (same source, every device),
        local only for the live tail newer than backfill's latest point
```

This is the closest two independent, backend-free browser sessions can get
to agreeing on history without a server computing it once for everyone —
see the honest limits below for what's still inherently device-dependent.

## Why this wasn't caught in Increment 10

The two-device screenshots that surfaced this originally showed different
numbers, and the diagnosis at the time (uneven same-day weighting) was a
real bug that explained *part* of the gap — the day-count discrepancy in
particular ("58 days of data") was fully explained by it. But it wasn't
the dominant cause of the 7-day/30-day percentage disagreement, which
turned out to be the precedence issue above. Caught by re-testing
specifically with a zero-history incognito session against a
long-history real device, which isolates the precedence bug in a way a
same-account, same-history-length comparison wouldn't have.

## What's still honestly device-dependent

- **Backfill freshness.** Each device's `trendCache` refreshes on its own
  24-hour clock, so one device's view of "the last few days" can be up to
  a day fresher than another's until both refresh.
- **Today specifically**, if it's newer than either device's current
  backfill cache — sourced from each device's own most recent live check,
  which can differ by however many minutes/hours apart those checks
  happened to be. This converges as both devices poll the same live price
  close together in time, and both are asking gold-api.com's actual
  current spot regardless.

Full byte-identical output on every device would require the signal
computed server-side from shared state — backend territory, the same
limitation already flagged in the monetization roadmap's Phase 4, not
introduced by this fix. What this increment fixes is the part that was
**wrong**, not the part that's an inherent tradeoff of a backend-free app.

## What stayed exactly as-is
`collapseToOnePerDay()` from Increment 10 (still needed — the precedence
fix alone doesn't prevent multiple local points on the "newer than
backfill" tail from still needing de-duplication). Every function
downstream of `getMergedHistory()` — unchanged, since this was fixed at
the single source again.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Confirmed the live deployed site was actually running v1.10 (not a stale
  cache) before diagnosing further, via a direct fetch of the deployed
  page.
- Full cross-check of every `$('id')` reference in JS against static ids —
  same three pre-existing dynamic-id exceptions, no new ones.
- No duplicate function declarations.

## Migration
None needed — no data model or key changes. This is the second pass at the
same underlying function; existing `history` and `trendCache` data is read
exactly as before, just recombined with corrected precedence.
