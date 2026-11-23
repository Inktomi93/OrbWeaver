---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A checked zod schema's record and map values pair with the checked type's values

## What

The output walk in tooling/src/unwired/graph/build.ts outputPairs stops at a zod record or map value and pairs none of its members with the checked type's value members.

## Why

The check holds each value to the declared value type, so a member there is as live as one under an object key, and the graph can still call it untouched.

## Done when

The walk pairs a record's and a map's value type with the declared value type under the shared-declaration rule, and a planted case is red without it.

## Evidence

Filled at landing: what ran and where its output is.
