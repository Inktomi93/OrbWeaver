---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# One builder per shape and one golden corpus

## What

Every contract output and database row has one builder in `@orb/testkit`, built from contract defaults or by running production. The seed tool writes one synthetic corpus that e2e, CTs, server tests and side-eye all read.

## Why

Hand-written fixtures drift from the contracts, and each test layer invents its own data.

## Done when

A builder exists per contract output and table; the corpus is committed and loaded by each test layer; a builder test reds when a contract adds a required field.

## Evidence

Recall recorder proofs need a production-derived `MemoryRecallSlice` seed. The schemas in `packages/contracts/src/chat/assemble.ts` have no slice defaults; `assembleTraceSchema` is not exported through the public chat door. The production recall function builds the slice, but has no direct public producer entry. Generate the seed through production composition and the shared corpus, not a hand-written zero trace or private import. Native recall filtering waits on that input; existing regression cases do not establish rebuilt coverage.
