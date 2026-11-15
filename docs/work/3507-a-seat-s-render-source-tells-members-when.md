---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: contracts
---

# A seat's render source tells members when the host set a trust step equal to the inherited one

## What

`resolveSeatRenderPolicy` in `packages/contracts/src/chat/roster.ts` reports a seat's source as own when the host set an explicit step, even when that step resolves the same as inheriting. A member then sees the source change while the resolved policy does not. The remark beside it says the source can be derived from the resolved step, which is false in that case.

## Why

The roster should tell a member nothing about the host's settings that the resolved policy does not already show.

## Done when

An explicit step that resolves the same as inheriting reports inherited, or the remark states the residual as accepted, and a unit test under `tests/contracts/` covers the case.

## Evidence

Filled at landing: what ran and where its output is.
