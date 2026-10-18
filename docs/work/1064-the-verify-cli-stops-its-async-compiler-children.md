---
kind: tooling
status: doing
updated: 2026-10-18
priority: P2
area: tooling
lane: wt/agent-ad57b7b38ce74731d
plan: test-foundation
---

# The verify CLI stops its async compiler children on SIGTERM

## What

The verify CLI has no SIGTERM handler, so children started through async spawnNiced (tooling/src/verify/ops/typecheck.ts around lines 316 and 342) are orphaned when the CLI is stopped.

## Why

Every stopped typecheck run can leak compiler processes; 1055 fixed only the synchronous inventory worker path.

## Done when

Stopping the verify CLI terminates and joins every child it started on any path, with one stop test per launch path, and the chosen design is recorded in the CLI header.

## Evidence

Filled at landing: what ran and where its output is.
