---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# The ports census follows a value through a generic bound

## What

The ports fix lane refused SquashRow: NamedRow rows reach squashSameRole<T extends SquashRow> through a generic bound, which the census does not treat as a flow, so the two restated row types stay review.

## Why

A restatement linked only through a generic bound stays hidden from the derive list.

## Done when

A value passed to a parameter typed by a type parameter links its type to the parameter's bound, a red-first planted case in tests/tooling/unwired/port-census.int.test.ts covers it with a look-alike twin, and the orchestrator reruns pnpm unwired ports.

## Evidence

Filled at landing: what ran and where its output is.
