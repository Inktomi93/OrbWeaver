---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a4550165b0e2df7ef
plan: cross-surface-consistency
---

# CT shard 2 asserts the phone room edges from before the 14px inset

## What

CI run 42608547761 at 32010ac06c failed 12 cells in CT shard 2. room-edges.ct.tsx at 320, 390 and 430 reads the composer content at 13px against 7. platform-phone-text-columns.suite.ct.tsx reads all eight chat styles about 12.8px narrower than their recorded Moonlit difference, for example bubble 238.4 against Moonlit 267.2. context-panels.ct.tsx finds no icon on the plugin column's edge control. The first two match the owner's 14px phone chat inset ruling and the 2231 shift that moves the rows, avatar and composer inward together, which the tests never took up. The third may come from a renamed control.

## Why

A red CT shard on main hides real regressions in the same suites.

## Done when

Each failing cell either asserts the ruled geometry, with the recorded Moonlit difference updated and cited to the 14px ruling in UI-Theming-and-Content.md, or names a real regression that is then fixed. CT shard 2 passes.

## Evidence

Filled at landing: what ran and where its output is.
