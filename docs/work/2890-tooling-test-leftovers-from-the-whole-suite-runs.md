---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: testing
---

# Tooling test leftovers from the whole-suite runs

## What

The ct-responder lint test reads a minimal fixture router; give it the middleware chain, an output schema and a context. The snap parity mask in `tests/support/node/tool-fixtures.ts` blanks to the end of the line after the concurrency field and drops the whole concurrent line; mask only the census format and filter rows by process id. The appearance anchor tooling test that scrolls without end and the vite file-watch test fail now and then in whole runs. `processTreeCpuMs` in `tooling/src/floor/host/platform.ts` has no production caller.

## Why

Each is a tooling test that proves less than it reads, or fails for reasons outside the change under test.

## Done when

The lint test's fixture is a full router shape, the parity mask keeps the lines it does not own, each flaky test is made deterministic or removed with its reason, and `processTreeCpuMs` is wired or deleted.

## Evidence

Filled at landing: what ran and where its output is.
