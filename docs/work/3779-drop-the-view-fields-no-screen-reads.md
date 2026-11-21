---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: contracts
plan: unwired-code
---

# Drop the view fields no screen reads

## What

AdminUserView\.updatedAt (packages/contracts/src/identity/index.ts) and AssetListItem.size (packages/contracts/src/assets/index.ts) are served by their queries and read by no client file. Both came in with the first view of their row, copied from its columns, with no stated reason.

## Why

A served field nobody reads costs a column read on every page and reads as a promise to show it.

## Done when

Both fields leave the interface, the schema and the query that fills them, and the affected router and CT suites pass.

## Evidence

Filled at landing: what ran and where its output is.
