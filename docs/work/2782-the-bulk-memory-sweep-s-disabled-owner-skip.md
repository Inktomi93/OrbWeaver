---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: security
plan: authorization-and-visibility
---

# The bulk memory sweep's disabled-owner skip has a case of its own

## What

The bulk memory sweep skips a disabled owner at its call site in `packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts`. Removing that check alone leaves every suite passing; only a break inside the shared function is caught.

## Why

The skip that keeps a disabled account from spending can be deleted without a test failing.

## Done when

A bulk memory sweep case shows no embed call for a disabled owner and no completion recorded, and goes red when the call-site check is removed.

## Evidence

Filled at landing: what ran and where its output is.
