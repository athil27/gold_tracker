# Gold Tracker — Increment 13: "Why does gold move?" (static, P0 of the Market Context proposal)

Ships the P0 scope from the Market Context / gold-drivers proposal, after
the real-time headline route (APITube.io) was tested live and found not to
support direct browser calls on its free tier — confirmed via three rounds
of console testing against the actual deployed origin, not assumed. No
data model changes — `goldtracker_schema_version` stays at 3, no new
localStorage keys, no JS changes at all. This is pure educational content.

## What changed

**New Reference entry: "Why does gold move? ▾"** — added as the first item
in More → Reference, ahead of the existing duty-free allowance, karat
purity, and spot/retail/jeweller entries, since it's the most foundational
piece of context among them.

Content: four drivers (US dollar strength, interest rate expectations,
safe-haven demand, central bank buying), each with one plain-language
sentence — no jargon, no causal claim about *today's* price specifically.
Closes with the same discipline already established elsewhere in the app:
*"This is general background, not a live reading — it explains how gold
behaves, it doesn't predict what it'll do tomorrow."*

## Why this version, not the real-time one

The original Market Context proposal's P1/P2 (a live "likely driver" line
inside Price Context, or a real-time headline feed) needs an external data
source. APITube.io was the strongest CORS-enabled candidate found, but
three live tests against the actual deployed app origin confirmed its free
tier doesn't grant CORS permission for direct browser requests — a
deliberate restriction on their end (several other providers found during
research explicitly warn against client-side key use for the same reason),
not a bug in the integration attempt.

Rather than route the request through a public CORS proxy — which would
have real downsides worth avoiding here: unpredictable uptime, and
critically, sending your API key through a third party you don't
control — the honest path was to ship what's genuinely achievable in a
backend-free static app today: durable, evergreen educational content that
needs no live source, no ongoing maintenance, and carries zero of the
trust risk that comes with automated causal claims about daily price
moves.

## What this deliberately doesn't do

No live headline feed, no "likely driver today" annotation, no automated
or AI-inferred causal claims about specific price moves. Those remain
possible future work (P1/P2 in the original proposal) but need either a
CORS-friendly data source that hasn't been found yet, or a small backend
proxy — real infrastructure work, not a quick addition, and out of scope
for a backend-free static PWA at this stage.

## Verification done before packaging
- HTML `<div>`/`<details>` tag-balance check — clean (133/133, 15/15).
- `node --check` on `app.js` — clean (no JS touched this increment).
- No new ids, no new function calls — nothing to cross-check against
  `app.js`, since this is static markup only.

## Migration
None needed — no data model, key, or logic changes. Pure content addition.
