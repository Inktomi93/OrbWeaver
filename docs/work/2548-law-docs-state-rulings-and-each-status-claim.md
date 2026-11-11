---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# Law docs state rulings, and each status claim in them is corrected against the tree

## What

The writing rule says law states rulings and not build status. The codebase review found law docs that describe a ruling after it moved, list adapters and omit some, and name checks that do not exist. The census marks each such sentence. Rulings are not touched by this item.

## Why

A law doc is read as the highest authority after the ledger. A status sentence in it that has gone false is trusted the most.

## Done when

Each sentence the census marks as a status claim or a missing checker in docs/law is corrected to what the tree does, tied to a resolvable cite, or moved to a work item when it describes work not yet built. No ruling is removed or weakened; the diff is reviewed for that.

## Evidence

Filled at landing: what ran and where its output is.
