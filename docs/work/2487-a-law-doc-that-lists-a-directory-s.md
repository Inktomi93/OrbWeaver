---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# A law doc that lists a directory's members is checked against the directory

## What

`docs/law/Tier-3-Infra.md` listed five infra adapters while the directory held more, and `docs/law/Tier-5-Entry.md` named import files that did not exist. Items 2465 and 2474 corrected both by hand. The writing rule says a list that grows names its directory or registry as the truth, and nothing checks it. The same shape can sit in the domain map in `docs/law/Constitution.md` and the other tier docs.

## Why

A cold author reads the law's list as complete and misses what it omits.

## Done when

An ordinary test compares the adapter directories under `packages/server/src/infra/` and the domain directories under `packages/server/src/domain/` with what the owning law doc names, read from the doc and the tree with no list of its own, and fails on a directory the doc omits or a name the tree lacks. Any other law doc found to list files or directories by name is changed to point at the directory instead.

## Evidence

Filled at landing: what ran and where its output is.
