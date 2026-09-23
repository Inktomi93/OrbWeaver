---
kind: adr
status: active
updated: 2026-09-23
---

# Semantic invariants and write atomicity stay review work, not gates

## Context

Some correctness claims are semantic. Examples are domain invariants such as the last persona delete or fork convergence, atomicity across several writes, and the pending guard on an interactive control. A syntax detector sees only local shapes. A measured batch-boundary detector flagged mostly correct code. The tree has several commit helpers with different semantics. It also has correct unbatched multi-write shapes: writes on disjoint branches, deliberate ordering across effects, and compare-and-set loops that depend on a result. Writes behind injected ops (`deps.characters.update`, `ctx.audit`) are interface calls, so a walk of one function cannot see them. `AwaitableBatchStmt` (`packages/db/src/kit/batch.ts`) is both awaitable and batchable by design, so the type system cannot forbid a standalone await.

## Decision

These claims stay review work. `pnpm review:mirror` builds the review scope. `REVIEW_FOCUS` in `tooling/src/review-mirror/lib/focus.ts` names each semantic target by a live symbol. `tooling/src/review-mirror/ops/pending-guard.ts` records the Button/Switch pending-guard census and classifies only the shapes it can prove. No active gate, marker convention or waiver vocabulary covers these claims. Add a new semantic candidate to `REVIEW_FOCUS`, not to a gate.

## Consequences

Coverage depends on review at milestones, not on every commit. Each focus row resolves to a live symbol, so a stale row fails the run instead of rotting. Atomicity that crosses domains through injected ops, such as the stats rebuild and the backup, is review work by construction.

## Alternatives rejected

A marker convention for invariants. Agents would add markers instead of proving the invariant. A gate that every multi-write function commit through one batch helper. Its precision was low, and its false positives are live idioms that would need an escape-marker vocabulary from the start. A literal-only gate for `disabled` guards. It would teach cosmetic `disabled` expressions instead of a real guard. Builder types that cannot be awaited. This conflicts with the dual nature of `AwaitableBatchStmt`.
