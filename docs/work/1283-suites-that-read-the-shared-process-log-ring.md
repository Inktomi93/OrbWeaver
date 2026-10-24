---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: tests
---

# Suites that read the shared process log ring collide under one worker

## What

`tests/server/domain/connection/verbs/sdk-wire.int.test.ts` asserts exactly one ring line for its seeded `caseId`, the first id the injected source mints, and under a shared module registry `tests/support/node/sdk-lifetime.int.test.ts` in the same worker writes a `sessionId` line with that same first id into the process log ring, so the count reads two. The case passes alone. Every suite that reads the process ring through the testkit observability seam has the same exposure: the ring is one per process, and two roots in one worker mint the same first ids.

## Why

A read of a process-wide ring from a per-root test is a shared-state read, and the shared registry (every project runs without isolation now) makes the overlap real.

## Done when

The observability seam scopes ring reads to the live roots: the first root opened with none live empties the process ring, a root opened while another is live does not, and overlapping roots share lines (a stated limit; no reader holds two roots live). Every ring reader in `tests/**` reads through the seam. The sdk-wire and sdk-lifetime suites pass together under `pnpm test <both> --no-isolate --maxWorkers=1 --no-cache`, with the control (the clear disabled) red. The testkit README's composed row states the scoping.

## Evidence

Filled at landing: what ran and where its output is.
