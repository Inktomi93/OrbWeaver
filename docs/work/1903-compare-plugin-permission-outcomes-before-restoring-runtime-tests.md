---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: security
plan: restoration-register
---

# Compare plugin permission outcomes before restoring runtime tests

## What

Route the comparison to security-executor. Compare the reference process-permission cases with `tests/server/infra/plugin-host/worker-permission-drop.int.test.ts` and the current production runtime. Judge main-thread and Worker read, process, SQLite and network restrictions individually.

## Why

The maintained Worker tests prove selected restrictions and continued host-call service. They do not establish equivalence to every reference permission outcome.

## Done when

Record covered, partial and inapplicable outcomes against the current Node permission contract. Any confirmed gap uses the real runtime, a precise denial and an allowed-operation positive. Update the register without recreating inapplicable runtime machinery.

## Evidence

Filled at landing: what ran and where its output is.
