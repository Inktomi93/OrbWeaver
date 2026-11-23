---
kind: tooling
status: blocked
updated: 2026-11-23
priority: P2
area: tooling
blocked: on 3891
plan: unwired-code
---

# pnpm unwired fields runs on the reference graph

## What

pnpm unwired fields still walks and resolves the tree with engine one (fields.ts, occurrences.ts, classify.ts) and keeps TypeScript 6 paths, while the graph now carries member roles and, after 3891, the fields judging.

## Why

D357: one core. Fields is the largest scan left on the old engine, and 3904 cannot delete it until fields moves.

## Done when

fields is a query over the graph and the 3891 judging; a row-by-row diff against the current fields report explains every moved row; the old fields engine path is deleted in the same change; its planted suites pass.

## Evidence

Filled at landing: what ran and where its output is.
