---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# pnpm unwired params runs on the reference graph

## What

pnpm unwired params walks and resolves the tree with its own engine path instead of querying the graph (D357).

## Why

D357: one core; a scan off the graph keeps a second resolver and role reader.

## Done when

params is a query over the graph; a row-by-row diff against the current params report explains every moved row; the old engine path for params is deleted in the same change; its planted suites pass.

## Evidence

Filled at landing: what ran and where its output is.
