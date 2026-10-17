---
kind: tooling
status: open
updated: 2026-10-17
priority: P2
area: tooling
plan: test-foundation
---

# The verify CLI and its inventory worker carry their own heap floor

## What

The verify CLI re-executes itself under a heap floor when `NODE_OPTIONS` carries none, and the semantic inventory spawner at `tooling/src/floor/compiler/semantic-inventory-worker-run.ts` passes the same floor to its worker, as `scripts/ts7.ts` does for the compiler. The floor is one constant beside the `pnpm-workspace.yaml` value, expressed as `--max-old-space-size-percentage` where a hosted runner sizes it.

## Why

A bare `node tooling/src/verify/cli.ts` run inherits nothing from `pnpm-workspace.yaml` and the server-world inventory worker dies at the default heap with status null and empty stderr, which reads as a tool error. Every lane that runs the CLI outside pnpm hits it.

## Done when

A bare `node` invocation of the verify CLI completes the server-world inventory with the same peak as the pnpm invocation. The worker spawn names the floor. A tooling test proves the worker exit path reports the heap floor when the worker dies by signal.

## Evidence

Filled at landing: what ran and where its output is.
