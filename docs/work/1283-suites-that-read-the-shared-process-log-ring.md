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

The observability seam scopes ring reads to the root (a per-root sink or a root tag on each line the reader filters by), or each root's id source starts from a distinct seed so no two roots in one worker share ids; the sdk-wire and sdk-lifetime suites pass together under `--no-isolate --maxWorkers=1` in one worker; the testkit README's observability row states the scoping.

## Evidence

Filled at landing: what ran and where its output is.
