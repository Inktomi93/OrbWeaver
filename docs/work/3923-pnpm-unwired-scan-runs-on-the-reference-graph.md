---
kind: tooling
status: blocked
updated: 2026-11-23
priority: P2
area: tooling
blocked: on 3891
plan: unwired-code
---

# pnpm unwired scan runs on the reference graph

## What

pnpm unwired scan, the member scan, still runs engine one over each world (scan.ts, type-members.ts, language-service.ts), while the graph's member buckets answer the same question over one merged program.

## Why

D357: one core. The member scan keeps the per-world programs and the TypeScript 6 language service alive, so 3904 cannot land until it moves.

## Done when

scan is a query over the graph's member buckets with the 3891 judging; a row-by-row diff against the current scan report explains every moved row; the old scan engine path is deleted in the same change; its planted suites pass.

## Evidence

Filled at landing: what ran and where its output is.
