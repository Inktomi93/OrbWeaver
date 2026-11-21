---
kind: tooling
status: open
updated: 2026-11-21
priority: P2
area: tooling
plan: unwired-code
---

# The unwired fields scan reads tRPC context, form field paths, narrowed messages and diagnostic sinks

## What

Review of the fields report found false-positive classes: reads through a tRPC procedure's ctx typed from Context; preset editor writes by TanStack field path such as params.reasoningSeed; reads through a narrowed message type (runner.ts reads every rate_limit_info field); the published plugin surface; outside-input schema keys reported as dead; and diagnostic sinks. Owner ruling: a field picked by name into a log, debug route or bug bundle counts as read; a field that only rides a whole-object dump does not.

## Why

These rows bury the real dead fields the judgement items need.

## Done when

Each class has a red-first fixture in tests/tooling/unwired and a scanner fix; outside-input schema keys report in their own bucket, never as judged rows; packages/contracts/src/plugin and packages/plugin-sdk sit in deliberate with the published-API reason; the orchestrator reruns the scans and every remaining row in the classes is checked.

## Evidence

Filled at landing: what ran and where its output is.
