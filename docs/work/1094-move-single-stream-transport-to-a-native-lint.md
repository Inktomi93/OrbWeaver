---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Move single-stream-transport to a native lint selector over the routers

## What

The single-stream-transport gate stays custom. Moving it needs a lint selector in packages/server/src/transport/trpc/routers/\*\* with the stream.ts override and an inline disable for impersonateStream, and the native member-origin delivery suites and the native-policy-cases member modes use this gate as their subject and need a replacement subject.

## Why

Item 1041 moves every gate whose claim a native rule can hold, and the router shard handed this one back for the selector and the fixture subject.

## Done when

An eslint selector in the router restrictions refuses a second stream transport, proved by a planted defect; the member-origin suites run on another subject; the gate module is deleted.

## Evidence

A runtime test already exists, unmerged: e2522b05f2 "pin the one-subscription tRPC transport at runtime" on branch wt/wf_d99749a9-c7a-46. Review and cherry-pick it as the successor before the single-stream-transport gate is deleted.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
