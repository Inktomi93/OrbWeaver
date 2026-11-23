---
kind: tooling
status: open
updated: 2026-11-23
priority: P1
area: tooling
plan: unwired-code
---

# The graph census ranks every reference context it gives no role

## What

A new pnpm unwired graph-census verb batches the checker's references for every product member declaration in one session, gives each reference site a normalized context signature (the syntax-kind chain from the reference to its statement, with the child slot at each step; trivia ignored), joins each site with the role the graph recorded there, and writes a histogram of signatures where the compiler has a reference and the graph recorded no role, or only a fallback one, with counts and sample sites.

## Why

Shape gaps have been found one real-tree run at a time: shorthand keys, satisfies tables, insert-select, method-syntax callbacks, ZodType annotations, keyof key lists. The tree holds a finite set of reference contexts, so one census lists every unhandled one at once and ranks the remaining graph batches by count.

## Done when

graph-census runs as a graph verb through tooling/src/unwired/index.ts; planted cases show a handled context absent from the histogram and an unhandled one present with its count and sample; a whole-tree run fits under the 16 GB bar; its histogram of the real tree is written under reports/unwired/ and each top signature is boarded or matched to an open item.

## Evidence

Filled at landing: what ran and where its output is.
