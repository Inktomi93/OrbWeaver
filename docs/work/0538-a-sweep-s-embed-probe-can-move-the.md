---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: embeddings
---

# A sweep's embed probe can move the target during a write that is then refused

## What

A card store or sweep calls resolveTargetGeneration outside the per-owner write queue (embeddings/verbs/store.ts:224,282,330; embed-corpus.ts:83,89). If it runs inside a binding write's probe window and its own probe reaches the host while the write's probe then fails (a flaky host), the target moves and the old index is purged although the write is refused and undone; the next store moves it back (two purges, two rebuilds, search paused meanwhile). Reproduced by the 0507 round-13 verifier (scratchpad rev13-0507/probe.int.test.ts).

## Why

A refused change should leave the index untouched.

## Done when

Target moves only follow a binding that has landed for good (e.g. moves wait on the owner's write queue, or the probe window cannot be observed by readers); the round-13 probe ends with the index intact.

## Evidence

Filled at landing: what ran and where its output is.
