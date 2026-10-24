---
kind: tooling
status: open
updated: 2026-10-09
priority: P2
area: docs
---

# Bind work-item closure to its current identity

## What

Prevent a stale Closes trailer from recommending or automatically landing a different current work item with the same identifier.

## Why

The drift reader accepts a trailer whose commit contains no matching item file. It can bind that trailer to an unrelated later item.

## Done when

Unknown-item trailers cannot automatically land a later item. Native controls preserve valid tracked-item closures and explicit manual landing.

## Evidence

Identity is the item filename `NNNN-slug.md` in the closing commit's own tree (`workFileNamesAt`, tooling/src/doc/ops/tree.ts). `drift` (`closedOnMain`, tooling/src/doc/ops/board.ts) and `land --merged` (`staleTrailers`, tooling/src/doc/ops/land.ts) keep a trailer only when that tree holds today's file for the id. `pnpm doc land <id> --evidence <sha>` is unchanged.

Tests in tests/tooling/doc/ops/board.int.test.ts: a stale trailer that bound to a later same-id item now yields no drift line and a `land --merged` refusal (red on the old code, green now); a different-slug trailer refuses; a manual land after the refusal works; the valid-closure and filed-and-closed, root, second-parent cases still hold.

Narrowed from the earlier drift fix: a lane that branched before the item was filed, closing an id the lane tree never held, no longer counts. It cannot be told apart from a stale trailer.
