---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# The touch variant of the composer terminal action suite flakes on main

## What

tests/client/features/app-shell/surfaces/platform-composer-terminal-action.suite.ct.tsx fails about one run in five in its touch variant only (4 of 20 on main, 3 to 4 of 6 to 10 solo on a branch): revealByTouch times out at 30 s waiting for the action to come into view. Attaching the scrollend listener before the pan did not fix it; no product timing bug was found yet.

## Why

A flaky CT gives no verdict and hides a real regression in the composer's terminal action reach.

## Done when

The cause is named (the touch pan, the scroll settle signal, or a product timing defect) and fixed with a real lifecycle signal, never a delay or retry; the suite passes 30 of 30 repeated runs on Chromium and WebKit.

## Evidence

Reproduced on the old test: `pnpm test:ct platform-composer-terminal-action.suite.ct.tsx -g "by touch" --repeat-each=20 --workers=3` on Chromium failed 12 of 20; repeats at 12 failed 6 and 9.

Cause (test defect, two parts). (1) Budget: the touch walk pans 75 px per gesture, 27 gestures across the two menus at 18 commands (about 0.65 s each, timed per pan), after 12 s of harness and mount, so a passing case already took 28 to 31 s against the 30 s budget and any load pushed it over; the timeout lands on whichever step is running (the `elementFromPoint` poll, the scrollend wait, `cdp.detach`). (2) Geometry: `revealByTouch` called the item visible against the menu's border box, but the scroll clip is the padding box, so an item flush with the border edge stopped the walk 1 px short and `toBeInViewport({ ratio: 1 })` read 0.977.

Fix: the walk tests visibility against the scrollport (`clientTop`, `clientHeight`), resolves the menu and the action once as element handles instead of a role query per step, and drives 4 commands per menu (the short host makes the menu overflow, not the item count; `scrollHeight > clientHeight` is still asserted). No delay, retry or raised timeout.

After: touch case `--repeat-each=30 --workers=3` on Chromium passed 30 of 30 (1-min load 24 to 28); the whole file on WebKit `--repeat-each=30 --workers=3` passed 30 of 30 (touch skips on WebKit by the case's own gate). The whole file on Chromium at 3 workers passed 56 of 60 and at 2 workers 59 of 60, all timeouts, on a box whose load stayed above 24 because sibling lanes held it there.
