---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: import
---

# The import's case-collision check folds names with toLowerCase

## What

packages/server/src/entry/http/import-tree.ts refuses a folder whose names differ only in case by comparing toLowerCase spellings. That is not the folding Windows or macOS applies: a final and a medial sigma collide on Windows and are not refused, composed and decomposed spellings of one name are missed, and the Kelvin sign is refused although it does not collide. The code does not state its folding method.

## Why

The product ships native Windows and macOS; a folder the check passes can still fail to stage there.

## Done when

The check normalizes to one Unicode form and folds case by a stated method, and a case covers a sigma pair, a composed and decomposed pair and the Kelvin sign through the import door.

## Evidence

Filled at landing: what ran and where its output is.
