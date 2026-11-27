---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a6726678d1a085caf
plan: unwired-code
---

# Timestamp surfaces assert their values and read alike

## What

Review of the timestamps batch found: world-info-edited-stamps.ct.tsx checks the first row only, context-tab-bodies.ct.tsx checks the label not the value, the Home roster tile has no case, an empty duplicate-character list shows no stamp, relative and absolute time forms are mixed across surfaces with an edited-now form, schedule rows now always wrap, and an Edited row equals Added on a card never edited.

## Why

Tests that check less than their names say let a wrong stamp ship, and mixed time forms read as inconsistent.

## Done when

Each named CT asserts the stamp value on every row it names, the roster tile has a case, an empty list states when it was computed, and one time form per kind of stamp is used, chosen with a ux review.

## Evidence

Filled at landing: what ran and where its output is.
