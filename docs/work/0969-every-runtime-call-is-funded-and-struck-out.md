---
kind: bug
status: doing
updated: 2026-10-13
priority: P1
lane: codex/runtime-funding-969
plan: inference-flow
---

# Every runtime call is funded and struck out the same way

## What

The pinned embedding snapshot (packages/server/src/domain/embeddings/verbs/runtime-connection.ts) and the imagery and rpg executor calls reach the executor without the funding verdict and without the auth-failure strike-out, which live only in the role clients. Put both checks where no call path can skip them, and test each path. Correct the compose comment about user-supplied URLs and sdkFetch to the real guard (global dispatcher plus write-time admission), with a security review.

## Why

A call path that skips the funding verdict or the strike-out can spend on a connection the funder cannot fund, or keep using a revoked credential.

## Done when

Every call path to the executor runs both checks (a test per path); the egress comment states the real guard; security review confirms.

## Evidence

The execution boundary must read current consent and credential authority, not only apply `canFund` to a captured snapshot. Pinned embedding snapshots retain stale consent and credentials after later authority changes. Preserve immutable generation/model configuration while refusing revoked, missing, foreign or stale authorization before accounting and provider I/O.

Reuse the runtime's owned-read capability with ownership checked before private parsing. This depends on the stored-connection parsing work. Remove duplicate role/chat strike handling and unused context wiring without retrofitting obsolete legacy observer contracts. Preserve original provider errors, secondary failure reporting and proven settled-signal cancellation semantics. Source mapping is not runtime qualification.
