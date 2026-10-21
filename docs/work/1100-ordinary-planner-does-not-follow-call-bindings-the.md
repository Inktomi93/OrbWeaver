---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Ordinary planner does not follow call bindings the reader traces

## What

The ordinary typed-column question planner plans remap fields at casts in the receiver chain, but a cast passed as a function argument and then remapped on the callee's parameter is traced by the reader and not by the planner, so that write throws selector not captured.

## Why

The result is a tool error rather than a silent pass, but a valid write in that shape would red the structure stage for a tooling reason.

## Done when

The planner follows the same call bindings the reader traces, a red-first plan test covers a cast argument remapped in the callee, and the server cohort stays within the runner budget.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
