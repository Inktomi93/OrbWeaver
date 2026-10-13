---
kind: bug
status: open
updated: 2026-10-12
priority: P1
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

Filled at landing: what ran and where its output is.
