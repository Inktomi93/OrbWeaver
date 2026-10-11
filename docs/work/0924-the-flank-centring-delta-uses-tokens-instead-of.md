---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a0ca70b1d44bcdbdb
---

# The flank centring delta uses tokens instead of a waived zero floor

## What

The plugin strip (c06f6f7f7c) added --flank-centre-flip-from in packages/client/src/features/app-shell/surfaces/shell.css:795 with a css-length-tokens waiver for its max(0px, …) floor, the same expression as the already-waived --shell-centre-flip-from. It arrived after item 899 set the waiver budget, so css-length-tokens alarms at 4 against 3 on main. Remove both waivers by expressing the centring delta without a raw length literal (a shared custom property or token that owns the zero floor, or a formulation that needs no floor), keeping the flip motion identical.

## Why

Owner ruling: fix findings, never raise a budget to admit one; the two copies of one centring formula are also a second home for one concept.

## Done when

No css-length-tokens waiver remains in shell.css for either centring delta, the budget row falls to the new count, and the flank and shell flip CTs pass unchanged.

## Evidence

Filled at landing: what ran and where its output is.
