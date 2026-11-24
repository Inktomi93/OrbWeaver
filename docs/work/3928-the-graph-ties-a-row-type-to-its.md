---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-add055fadb73fb716
plan: unwired-code
---

# The graph ties a row type to its table by the checker, not by member names

## What

resolve.ts #rowHomes and flows.ts #memberPairs place a row member on a table column when the row type's member names match the table's columns. The checker links a type to its table only through typeof table.$inferSelect; InferSelectModel<typeof t>, select results, Pick and Awaited reach no table symbol.

## Why

Name matching can tie an unrelated type whose members happen to spell a table's columns to that table, crediting or hiding a column read.

## Done when

Both places use one rule that ties a row type to its table through the drizzle types the checker resolves (including InferSelectModel, select result rows, Pick and Awaited), with a planted unrelated type that spells the same columns and is not tied.

## Evidence

Filled at landing: what ran and where its output is.
