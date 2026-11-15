---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: tests
plan: test-foundation
---

# Server and inference tests missing for the automation stream tier filter, the local-light load guard and a cancelled themes workload

## What

These cases do not exist: (a) The `automation` stream room in `packages/server/src/transport/trpc/stream/sources/automation.ts` drops every event but `quickReplySurfaced` for a `member-visible` subscriber and re-resolves the tier per event; no test drives the room, so inverting the filter or caching the tier stays green. (b) The load guard in `packages/inference/src/backends/local-light/model-cache.ts` turns a model library loader's detached rejection into a rejection of the load that caused it; only `tests/server/domain/connection/local-light-cold-cache.suite.int.test.ts` reaches a real load, and it runs only when opted in with network access. (c) `packages/server/src/domain/discovery/themes/generate.ts` checks abort before `replaceAll` and runs `backfillMsgMidAt` under its own signal; no case cancels after the replace commits, which needs more theme-assigned digests than `STAMP_WRITE_CHUNK` and an observable step inside the replace-to-stamp window.

## Why

A regression in the filter leaks the host's rule events to members, a regression in the guard lets a missing model file crash the local-light worker, and a regression in the stamp pass leaves themes with a null message mid-point that timeline reads skip.

## Done when

An application test attaches the `automation` room as a host and as a member through the composed root, publishes a host-only event and a `quickReplySurfaced`, and asserts the member receives only the chip, including after a host handoff mid-stream; a default-run test drives a model load whose library loader rejects detached and asserts that load rejects with the loader's error while the worker stays up; a case at the themes workload door cancels after the commit and finds every theme stamped.

## Evidence

Filled at landing: what ran and where its output is.
