---
kind: work
status: doing
updated: 2026-10-13
priority: P1
lane: codex/compose-import-998
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

Close the logical table/output inventory before broad edits. Exported declarations alone do not distinguish outputs from inputs, operations and primitives. Existing user and asset factories are not qualified defaults: their fabricated user prefix and padded asset hash differ from genuine producers. Reuse canonical ID and content-hash generation, preserve FK relations and map coupled consumers before correcting shared helpers. The harness owns graph/time/ID seams; the client-door lane owns mounting, while this item owns data builders, corpus and responders.
