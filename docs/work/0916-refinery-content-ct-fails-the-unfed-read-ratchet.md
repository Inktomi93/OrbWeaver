---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: tests
---

# Refinery content CT fails the unfed-read ratchet on main

## What

pnpm test:ct tests/client/features/refinery/surfaces/refinery-content-surface.ct.tsx passes its tests and then exits 1 from the unfed-read ratchet on character.list and refinery.listSessions, on main's checkout as well as on lane branches. The file has no baseline row and its stubs do not feed those two reads. Feed both reads from real test-data builders (owner ruling: full contract output, see item 906), or find why the surface reads them.

## Why

A CT file that is red on main poisons every lane's evidence for that file and hides new failures.

## Done when

The refinery content CT exits 0 on main with both reads fed.

## Evidence

Filled at landing: what ran and where its output is.
