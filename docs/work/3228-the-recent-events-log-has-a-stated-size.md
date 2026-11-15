---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# The recent-events log has a stated size bound

## What

`recentEvents` is appended on each scene update and copied whole into every snapshot row (the config comment calls it append-only by design). Measure a long game's row size and either record that it is acceptable or keep a bounded tail in the snapshot and the full record in the journal.

## Why

Every snapshot row carries the whole log, so storage grows with the square of play length.

## Done when

A measured long game shows an acceptable row size, or the snapshot holds a bounded tail with a test.

## Evidence

Filled at landing: what ran and where its output is.
