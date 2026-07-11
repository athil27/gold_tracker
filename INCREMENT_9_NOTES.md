# Gold Tracker — Increment 9: Portfolio collapse, Price Context tiering, persona depth

Ninth implementation pass, built from the product review that found clutter
had migrated from Home (fixed in Increment 8) into Portfolio and into Price
Context's own internals. Implements all P0 and P1 items plus both P2 items.
No data model changes — `goldtracker_schema_version` stays at 3, no new
localStorage keys.

## What changed (P0)

**1. Portfolio's heaviest sections are now collapsible.** Allocation by
karat, the full India-vs-Saudi comparison, and Landed Cost (NRI) are now
`<details class="section-details">`, matching the pattern already
established in Home and More. Portfolio Summary, Goals, and Purchase Log —
the tab's actual reason for existing — stay open. This was the highest-
leverage change available: the pattern already existed elsewhere in the
codebase, this just applied it to the one tab that had never gotten it.

**2. Price Context tiered internally, not just page-level.** The card had
grown to six stacked elements (label, numbers, chips, confidence, track
record, disclosure) at similar visual weight. Now: label stays primary;
the numbers line is promoted (13px, full-brightness text, was 12px muted)
since it's the actual evidence a glance should land on; chips and
confidence are tightened into one secondary cluster; track record keeps
its border-top separation as the deepest, most-skippable tier. No content
removed — this is a CSS-only hierarchy pass.

**3. Landed Cost's allowance input now points at its actual source.** A
new line — *"Not sure what your allowance is? Check current limits in
Reference (More) →"* — sits directly above the allowance field, linking to
the Reference section that already has the real duty-free figures with the
"verify at cbic.gov.in" caveat. Previously that connection only existed in
a subnote below the input; now it's positioned before you type a number
you might be guessing at.

## What changed (P1)

**4. The two trust disclosures no longer read as duplicates.** "How this
is read" / "How we calculate this" → **"How the signal is computed — 7/30-
day averages"** / **"How the comparison is computed — premiums + FX"**.
Different mechanism, different label, and per P2 below, the label itself
now previews the content instead of requiring a tap to find out what's
inside.

**5. Coordinated first-load state.** Price Context was previously
`display:none` until data resolved — invisible, while the comparison
teaser was already showing "Loading India vs Saudi comparison..." Now
Price Context is always visible with its own honest loading state
("Reading today's price context…"), and — deliberately — the *same*
message covers both "still loading" and "genuinely not enough history
yet" ("Still gathering enough history for a confident read"), since
neither should overclaim a signal that isn't there yet. Holdings line's
default text changed from a bare "--" to "Loading your holdings…" for the
same reason: three pieces of Home content that now read as one coordinated
moment instead of three independently-timed placeholders.

**6. Persona depth extended to Price Context's internals.** Investor
persona gets a `.detail-forward` class that un-mutes the confidence and
track-record lines (more likely to actually read them than glance past).
Buyer persona gets the "How the signal is computed" disclosure open by
default — the highest-intent, lowest-frequency persona is the one most
likely to need the reasoning, not just the label, on the visit that
matters.

## What changed (P2 — both included)

**7. Disclosure labels now preview their content.** Covered by item 4 above
— "7/30-day averages" and "premiums + FX" in the collapsed label itself,
not just inside the expanded text.

**8. Portfolio gets a one-line top summary**, same pattern as Home's
holdings line: *"10.5g owned · ₹1,03,250 +5.2%"* sits above all six
sections, so landing on the tab orients you before you scroll past
anything. Extracted into a shared `holdingsSummaryHtml()` helper used by
both Home and Portfolio, rather than duplicating the formatting logic.

## A functional bug caught and fixed while wiring this up

Making Landed Cost and the full comparison collapsible broke their
existing "jump here from Home" links — `goToTab('portfolio')` alone now
lands on a *closed* accordion, since `<details>` hides its content
regardless of scroll position. Fixed with two new helpers,
`goToLandedCostSection()` and `goToComparisonSection()`, that navigate to
Portfolio *and* set the relevant `<details>.open = true`. All three
Home-side links that point into these sections (`openLandedCostFromHome()`,
the comparison teaser's "Full detail →", and the non-NRI Landed Cost
teaser's "Track allowance →") now use these instead of a bare `goToTab()`
call. Worth flagging in case any other cross-tab link is added later
pointing at a collapsible section — the same pattern applies.

## What stayed exactly as-is
Price Context's and the comparison's underlying computation (Increment 7),
all persona position/visibility logic from Increment 8, the Add Purchase
bottom sheet, Goals and Purchase Log's always-open treatment (correctly
identified as the tab's actual purpose, not clutter), and everything else
not explicitly listed above.

## Verification done before packaging
- `node --check` on `app.js` — clean.
- Full cross-check of every `$('id')` reference in JS against static ids in
  `index.html` — same three pre-existing dynamic-id exceptions, no new
  ones.
- Cross-check of every inline `onclick="fn(...)"` in HTML — all resolve,
  including the two new section-opening helpers.
- Specifically re-tested every Home→Portfolio jump link against the newly-
  collapsible sections after the fact — this is what surfaced the
  closed-accordion bug described above.
- HTML `<div>`/`<details>` tag-balance check — clean (133/133, 14/14).
- CSS brace-balance check — clean (169/169).
- No duplicate function declarations.

## Migration
None needed — no data model or key changes. This increment only changes
hierarchy, wording, and collapse state across Portfolio and Price Context;
every existing purchase, goal, alert, persona choice, and trip carries over
untouched.
