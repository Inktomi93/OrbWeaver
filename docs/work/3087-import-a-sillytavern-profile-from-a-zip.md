---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: import
plan: import-robustness
---

# Import a SillyTavern profile from a zip

## What

The SillyTavern import takes a folder only (`packages/server/src/entry/http/import-tree.ts`). Add a zip branch to the tree door that unpacks a SillyTavern profile zip into the same staged tree, so it shares the folder's parse, preview and script lift.

## Why

Owners move a SillyTavern profile between machines as a zip; today they must unpack it first.

## Done when

A SillyTavern profile zip imports through the Library import with the same preview and result as the same folder, preset scripts included.

## Evidence

Filled at landing: what ran and where its output is.
