---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Closeout 4 P3 editors: save bar name at 200% and 300%, preset tab reveal on return, world info entry alignment, hand-edit on an empty scope

## What

Fix four editor findings from the closeout 4 side-eye review. The save bar shows no name at 300% text on a 320 wide phone and cuts the name at 200%. The preset tab reveal fails on return. The World Info entry heading and its fields do not align. Hand-edit on an empty scope opens with no fields and no reason.

## Why

The review measured each of these on screen. The Evidence names the source report and its run ids.

## Done when

Each finding is fixed with a component test, or answered with a cited reason, and a rendered pass of the same views shows none of them.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.
