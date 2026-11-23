---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# The graph census counts a copy into a column as carried by that column

## What

The graph census counts a direct copy into a store (a values or set key holding a member read, a nullish or logical-or copy, or a bare conditional branch) as a role gap, but tooling/src/unwired/graph/sites.ts handedToColumn silences that copy on purpose through boundaries.ts copiedReads: by the ruling in docs/plans/unwired-code/design.md, a member stored into a Drizzle column is read only where the product reads the column back, and a member nothing else uses reports untouched or write-only. A probe showed nested value expressions (calls, templates, conditionals) already read. So the census family is a counting error, not a graph miss; embedUsageSchema.totalTokens copies into a column nothing reads back.

## Why

A census that counts a ruled silence as a gap overstates the graph's misses and sends work at the wrong tool.

## Done when

The census ranks a handedToColumn copy as carried by its column, the family leaves the gap count on a rerun with no graph verdict moving, and each named write-only row's column shows never-read in the columns scan or is listed with its reader.

## Evidence

Filled at landing: what ran and where its output is.
