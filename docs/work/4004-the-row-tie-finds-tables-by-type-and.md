---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-ae5b974b295e2abab
plan: unwired-code
---

# The row tie finds tables by type and covers spread rows in flows

## What

Three gaps the 3928 lane left: tables are still recognized by the callee name sqliteTable rather than by the checker's table type; a value spread from a row and handed whole to a function is resolved through its source for reads only, not for the flow walk's row slots; and the first graph-rows case still passes with every tie disabled, so it does not test the tie.

## Why

A name-matched table call misses a wrapper or a renamed import, a spread row's flow loses its table, and a case that passes with the rule off pins nothing.

## Done when

A table is recognized by its checker type with a planted wrapper case, a spread row handed to a function ties its slot with a planted case, and the first graph-rows case fails with ties disabled.

## Evidence

Filled at landing: what ran and where its output is.
