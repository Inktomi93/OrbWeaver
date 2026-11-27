---
kind: tooling
status: open
updated: 2026-11-27
priority: P2
area: tooling
plan: unwired-code
---

# removed-keys refuses only on changes the program reads

## What

tooling/src/unwired/graph/removed-keys.ts refuses on any git status porcelain line, so an untracked directory no world includes (such as .deja/) stops the run.

## Why

On main the run cannot start, so the verb is unusable at the barrier.

## Done when

A planted untracked file outside every world lets the run proceed, and a planted one inside a world or a tracked change still refuses.

## Evidence

Filled at landing: what ran and where its output is.
