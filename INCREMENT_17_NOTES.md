# Gold Tracker — Increment 17: Tab-switch transition

Small, targeted fix in response to feedback that switching tabs "feels
like a reload" — it did, literally: `goToTab()` toggled
`display:none`/`''` instantly with no transition at all. No data model,
Worker, or layout changes; `worker.js` untouched this round.

## What changed

**`style.css`:** `.tab-panel.tab-enter` plays a 0.2s fade + slight
upward-rise animation (`opacity 0→1`, `translateY(6px→0)`) when applied.
Respects `prefers-reduced-motion: reduce` (animation disabled entirely
for anyone with that OS/browser setting). Also added a 0.15s `color`
transition to `.tab-btn` so the active tab's gold highlight eases in
instead of snapping.

**`app.js`, `goToTab()`:** the newly-active panel gets `.tab-enter`
added — but first removed and a reflow forced (`void panel.offsetWidth`)
so the animation replays even when returning to a tab you were already
on. Without that step, adding a class that's already present is a no-op
to the browser and the animation silently wouldn't fire the second time.

## What was deliberately left alone

- `display:none`/`''` toggling itself, still there — `display` isn't an
  animatable CSS property, so there's no way to cross-fade the outgoing
  panel with the incoming one without a heavier rewrite (overlapping
  panels, `position:absolute`, z-index management). This is an entrance
  animation for the panel appearing, not a two-panel crossfade. If the
  instant disappearance of the outgoing tab still reads as abrupt after
  this, that's the next thing to look at — flagging it now rather than
  claiming this fully solves "feels like a reload."
- `window.scrollTo({top:0, behavior:'instant'})` on tab switch — left
  as-is; landing at the top of the new tab is expected app behavior, not
  part of the complaint.
- The other two things raised as options during triage (browser chrome
  visibility, cross-tab visual inconsistency) weren't selected as the
  actual issue this round — not touched.

## Verification done before packaging

- `node --check app.js` — clean.
- CSS brace-balance — 186/186 (was 180/180; +6 matches the new rule
  block — `.tab-btn` transition line, `.tab-panel.tab-enter`, the
  keyframes block, and the reduced-motion media query).
- `<div>`/`<details>` tag-balance — 148/148, 16/16, unchanged (no new
  HTML elements this round, only a class toggle and CSS).
- No duplicate function declarations.
- `sw.js` `CACHE_NAME` bumped v19 → v20; footer version bumped to v1.17
  (Increment 17).

## Not included in this delivery

`worker.js` unchanged — not re-verified with `node --check` this round
since nothing in it was touched. `manifest.json`, icons, `DEPLOYMENT.md`
still not part of this session's files, same as the last two increments.
