---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: unwired-code
---

# Say where the removed-fields scan tables live, since reports are not committed

## What

The removed-fields item's Done asks for committed tables, but the reports folder is gitignored in .gitignore.

## Why

Landing either skips the criterion silently or force-adds generated tables.

## Done when

The item names where the tables live (the reports folder plus a content hash in Evidence), or the owner rules otherwise.

## Evidence

Filled at landing: what ran and where its output is.
