---
kind: tooling
status: doing
updated: 2026-11-09
priority: P2
area: tooling
lane: wt/agent-adcd4d2f6daff6c55
plan: cross-surface-consistency
---

# Item minting counts ids that a merge commit added or landed

## What

highestHistoricId in tooling/src/doc/ops/tree.ts reads readGitPathHistory (tooling/src/floor/git/git-history.ts), whose git log shows no merge diffs. An item minted and landed inside merge commits is invisible to it, so the next mint reuses that id. It happened here: the EmptyState item 2348 was minted in the merge a199f633fa and landed in the merge 5c523cdca6, and the next mint took 2348 again until it was renumbered to 2349 by hand. Plain git log on docs/work/2348-\* finds one file; with -m it finds both.

## Why

A reused id points an old Closes trailer and landedCommit at a different item, so doc land --merged can close the wrong work.

## Done when

The history read counts paths that merge commits add or delete, a tooling test mints after an item that a merge added and landed and gets a fresh id, and the doc check reports an id that two items ever carried.

## Evidence

Filled at landing: what ran and where its output is.
