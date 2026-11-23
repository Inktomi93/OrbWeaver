---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The ports census keeps the port-ownership rule's TypeScript 6 helpers

## What

The ports census (tooling/src/unwired/port-census.ts, port-plan.ts, port-targets.ts, forgotten-exports.ts and doors.ts) plans the rewrites for the orb/derived-port-member rule and is built on that rule family's TypeScript 6 helpers in tooling/src/eslint/. Porting it to the 7.1 graph would make a second home for derived-member logic while typescript-eslint stays on TypeScript 6.

## Why

D357 makes the graph the one unwired engine; the census is the one ruled exception, so its reason is recorded where the rule lives and the exception cannot spread to another scan.

## Done when

D357 records the census as the one unwired module that keeps TypeScript 6, with this reason; the census imports its derived-member logic only from tooling/src/eslint/ and keeps no copy; 3904's done line excludes it by name; no other unwired verb imports the census's TypeScript 6 helpers.

## Evidence

Filled at landing: what ran and where its output is.
