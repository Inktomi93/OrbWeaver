---
kind: bug
status: open
updated: 2026-11-01
priority: P2
area: client
plan: cross-surface-consistency
---

# platform-connection-readout CT fails on main in four cases

## What

The suite asserts the Connections list heading is unpainted in the list view and stays unpainted after the drill-in, matching production.

## Why

fddfd1ad49 made the list-view `Heading level 3` screen-reader-only (0839 owner ruling), so the suite's list-view `settledBox(heading).height > 1` (and the after-Done assertion) failed in all four regimes. Production is right; the suite was stale. `connections-list-heading.ct.tsx` already pins the unpainted list heading.

## Done when

`platform-connection-readout.suite.ct.tsx` passes in all four regimes; the drill-in still asserts group heading, one level-3 heading, anchor id, Back focus and Done focus return.

## Evidence

Red: 4 failed / 8 passed on main at `platform-connection-readout.suite.ct.tsx:157`. Green after the fix: see the landing commit.
