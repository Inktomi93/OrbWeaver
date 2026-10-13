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

Recall recorder proofs need a production-derived `MemoryRecallSlice` seed. The public `assemblyPreviewSchema` carries the canonical recall schema through its trace. Validate that projection without adding another schema or public door. Generate nonempty recall through production composition and the shared corpus, not a hand-written zero trace or private import. Native recall filtering waits on that input; existing regression cases do not establish rebuilt coverage.

Close the logical table/output inventory before broad edits. Exported declarations alone do not distinguish outputs from inputs, operations and primitives. Existing user and asset factories are not qualified defaults: their fabricated user prefix and padded asset hash differ from genuine producers. Reuse canonical ID and content-hash generation, preserve FK relations and map coupled consumers before correcting shared helpers. The harness owns graph/time/ID seams; the client-door lane owns mounting, while this item owns data builders, corpus and responders.

Inventory data returned or serialized by live production doors and their reusable output components. Include server-owned wire projections; keep their producers in the node world. Classify request schemas, injected operations, primitive vocabulary and private helper shapes separately. Exported-name counts do not establish the builder denominator.

Capture HTTP auth outputs through the real application and its resolved request identity. A tRPC caller does not produce anonymous auth configuration. The server root owns HTTP construction; corpus code must not build another app or copy its projection.

The complete auth-configuration wire schema is missing. Its canonical contract and consumer parsing belong to the [boundary-parsing assignment](0982-wire-values-are-parsed-at-every-boundary-not.md). Keep that builder incomplete until the production owner exists; continue independent builders and real HTTP capture.

Browser responders select actual captured route inputs and outputs. Preserve absent versus explicit null input, reject conflicting captures, and refuse unmatched input without a fabricated success. This lookup does not establish generated corpus adoption.
