---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# The unwired ports census follows JSX props, element flows and registration slots

## What

The ports review (reports/unwired/ports-judge.md) found the census misses real flows: props forwarded through JSX attributes (ParamsDeckProps), array and async-iterable element flows (PlanRow into CacheMarkerRow, StProfileZipFile into ZipEntry), a handler's parameter registered into a ToolDefinition slot, and a domain contract restating a primitive wired at compose. SeedPlate reports as review although D160 requires the restatement, SPLIT_RULING in tooling/src/unwired/port-targets.ts cites no ADR, and distinct-lookalikes.ts lacks the judged pairs the review lists.

## Why

Missed flows hide true restatements, and unruled look-alikes keep resurfacing.

## Done when

Each recall gap and the dependency-rule restatement has a red-first planted case in tests/tooling/unwired/port-census.int.test.ts, SPLIT_RULING cites its ruling, the listed pairs are in distinct-lookalikes.ts, and the orchestrator reruns pnpm unwired ports.

## Evidence

Filled at landing: what ran and where its output is.
