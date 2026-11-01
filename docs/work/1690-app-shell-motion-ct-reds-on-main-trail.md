---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: client
plan: test-foundation
---

# app-shell-motion CT reds on main: trail N outside (cases at :592, :626, :854)

## What

The track FLIP counts a change in the topbar trail's own width. The door records the trail's width at the stamp, and the trail's counter-translate adds the difference to its live width.

## Why

Three cases in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` fail with the trail outside its corridor (`trail 1015 outside 629…1003`). Opening the context pane takes `.shell-main` from 917 to 568 px. A container query then hides the chip count inside the trail, which makes the trail's content 14 px narrower in the same style resolution. The trail row keeps its React-held `flex-basis` (the claim) until its ResizeObserver re-measures, so its box holds 239 px for one frame and then drops to 225 px. The trail is pinned to the end edge, so the start edge steps 14 px right. The FLIP counter assumed a constant width.

Holding the measure until the track settles does not meet the corridor: the held box would end 617 px from the start edge, below the 629 px floor, and then snap 14 px on release.

## Done when

- `pnpm test:ct tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` passes with the corridor and the first-frame hold unchanged.
- The topbar and panel edge suites stay green.

## Evidence

Before: 3 failed, 15 passed. After: 18 passed. Probe on the old tree, leg "Show details": trail x 1001, 1001, then 1015 with trail width 239 then 225.
