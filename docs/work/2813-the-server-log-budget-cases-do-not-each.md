---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: test-foundation
---

# The server log budget cases do not each wait on a real broker start

## What

The cases in `tests/server/infra/plugin-host/server-log-budget.int.test.ts` each start a real broker, and one timed out at the default limit under load.

## Why

A load-sensitive case reads as a product red.

## Done when

The cases share one broker where a case needs no fresh one, or the window clock is injected so no case waits on wall time; the file passes at the default limit under load with no slow tag and no larger budget.

## Evidence

Filled at landing: what ran and where its output is.
