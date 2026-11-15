---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: tooling
---

# The board never reuses the id of a landed item

## What

Minting a batch gave new items the ids of items landed earlier the same day. A commit trailer or a note that names one of those ids now points at two different items across history, and a landing by trailer can close the wrong one.

## Why

An id is the only stable name an item has in commit messages, bridge notes and plan rows. Reuse makes history ambiguous and makes a trailer-driven landing unsafe.

## Done when

Minting takes the next id above the highest id ever used, read from git history or a committed counter, and a test at the doc tool's own door mints after a landing and proves the landed id is not handed out again.

## Evidence

Filled at landing: what ran and where its output is.
