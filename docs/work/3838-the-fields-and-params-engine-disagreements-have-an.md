---
kind: tooling
status: doing
updated: 2026-11-22
priority: P3
area: tooling
lane: wt/pending-engines
plan: unwired-code
---

# The fields and params engine disagreements have an owner and a fix

## What

pnpm unwired fields reports 3 disagreements and pnpm unwired params reports 2 between engine one and the TypeScript 6 engine. The design's Engine disagreements section names two owner items that landed long ago, so no open item owns the rows.

## Why

A disagreement means engine two found a production site engine one lacks, so engine one may report live code as dead.

## Done when

Each disagreement row is traced to its cause, engine one recognizes the site with a red-first planted case or the row is shown to be an engine two error, both scans report zero disagreements, and the design section cites this item.

## Evidence

Filled at landing: what ran and where its output is.
