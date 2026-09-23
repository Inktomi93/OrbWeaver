---
kind: adr
status: active
updated: 2026-09-23
---

# Async work is awaited, owned by its boundary, or supervised-detached

## Context

Syntax rules rewarded the wrong thing. `noAwaitInLoops` could not tell ordered work from accidental serialization, `void` silenced floating promises without adding a rejection path, and skipped tests were hidden behind annotations that reported a status the runner never gave.

## Decision

A promise is awaited or returned, handled by the boundary that owns its failure, or started through `superviseDetached(requestId, spanName, attrs, operation)` beside `withRequestSpan` in the tracing seam. The operation is a factory, so the work starts inside the detached root, and the helper owns the rejection. Sequential loops stay sequential; Biome `noAwaitInLoops` is off. ESLint `no-floating-promises` runs with `ignoreVoid: false`. Chat deltas queue on a per-turn promise tail that the turn awaits before any terminal emit, so a failed delta fails the turn. A test that cannot run skips through the runner (`test.skip(condition, reason)`, `describe.skipIf`); a front door that promises live evidence fails when every collected test was skipped.

## Consequences

`detached-work-traced` teaches the supervisor, never `void withRequestSpan(...).catch(...)`. Client code keeps its own owners: a resultless mutation may use the `mutate` door whose `onError` owns the failure. `monotonic-tests` flags a hand-written `skipped` annotation, because only the runner may report a skip.

## Alternatives rejected

- Keep `noAwaitInLoops` with better comments: the rule cannot see ordering, locks or transactions.
- Autofix loops to `Promise.all`: it changes scheduling, which is the defect.
- Biome `noVoid`: syntax-only; it bans harmless synchronous uses and proves nothing about rejection.
- Allow `void` with a naming convention: `void` changes neither scheduling nor rejection.
- One `fireAndForget` helper for client and server: UI mutation ownership, lifecycle supervision and durable event order are different contracts.
- Pass an already-started promise to the supervisor: it can reject before the supervisor attaches.
- Catch a failed chat delta and continue: a missing durable delta followed by terminal success corrupts the event history.
- Ban all skip syntax: it pushes authors back to annotation-and-return evasion.
- Count skip annotations or test declarations as evidence: neither is an executed runner result.
