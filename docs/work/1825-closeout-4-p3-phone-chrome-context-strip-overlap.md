---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# Closeout 4 P3 phone chrome: context strip overlap, twin kebabs, truncated screen titles, Refinery short landscape scroll

## What

Fix four phone chrome findings from the closeout 4 side-eye review. The chat context strip overlaps the tab control. The phone character sheet has two adjacent kebab menus. Screen titles truncate when actions share the bar. Refinery in short landscape opens scrolled past its top.

## Why

The review measured each of these on screen. The Evidence names the source report and its run ids.

## Done when

Each finding is fixed with a component test, or answered with a cited reason, and a rendered pass at the phone sizes shows none of them.

## Evidence

Context strip overlap: not reproducible at 390x844 (the strip ends at 282 and All Chat tabs starts at 282). Twin kebabs: real, tracked as 2053. Truncated screen titles: landed with 2045 in the P2 batch. Refinery short landscape opening scrolled: not re-measured; the snap instrument could not boot a page in this worktree.
