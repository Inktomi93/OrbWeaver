---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The unwired unions scan reports parsed members apart from unbuilt ones

## What

Most unions rows are parsed members only outside input produces (the IMAGE\_ tuples the vision model fills, provider and card values), mixed into the same list as the unbuilt members that are real findings.

## Why

The real unbuilt rows are buried under rows the plan already keeps.

## Done when

Parsed members report in their own list with the outside source named, the unwired list holds only unbuilt members, and a planted case covers each.

## Evidence

Filled at landing: what ran and where its output is.
