---
kind: bug
status: open
updated: 2026-11-24
priority: P1
area: tooling
plan: unwired-code
---

# The graph traces values so a widened member reaches the slot that reads it

## What

historyTurnTokens.extraTokens in packages/server/src/domain/chat/assembly/history-budget.ts reads dead though wire-history.ts writes it: the cost row is returned as ShapedHistoryRow\[], handed on as HistoryTurn\[] and reaches historyTurnTokens' inline parameter through a reduce callback, so no static type on the path names the member. A type-keyed carry over-credits every value widened into the same type, so the read can be credited only by tracing value nodes: a call from its function's returns, a binding from its initializer, a parameter from every call site's argument across files, and a callback parameter from its receiver.

## Why

A dead verdict on a live member is a false delete: removing the read would drop frame overhead from the history budget.

## Done when

The graph traces values through returns, initializers, call-site arguments and callback receivers, a member a narrower type drops reaches a later slot naming it only along that value's own trace, extraTokens leaves the dead list on the real tree, and a sibling value widened into the same type that never reaches the slot stays write-only.

## Evidence

Filled at landing: what ran and where its output is.
