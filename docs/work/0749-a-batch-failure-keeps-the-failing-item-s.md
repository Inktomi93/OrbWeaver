---
kind: bug
status: open
updated: 2026-10-05
priority: P1
area: inference
---

# A batch failure keeps the failing item's stack

## What

ProviderError.withPartialItems (packages/inference/src/contract/errors.ts:153-160) builds a fresh error with cause: this.cause, so the logged batch error shows a throw site in runSideGen and loses the failing item's real stack. Found by the inference round 2 review.

## Why

A refinery or digest batch failure in the log points at the wrong place.

## Done when

withPartialItems keeps the original error's stack (or keeps it as the cause without repeating the message), with a test.

## Evidence

Filled at landing: what ran and where its output is.
