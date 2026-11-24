---
kind: bug
status: doing
updated: 2026-11-24
priority: P1
area: tooling
lane: wt/agent-a8188e6e4871fd1c3
plan: unwired-code
---

# An argument's members pair with an inline parameter type's members

## What

The graph calls historyTurnTokens.extraTokens (packages/server/src/domain/chat/assembly/history-budget.ts) dead and read-only, but packages/server/src/domain/chat/substrate/wire-history.ts writes extraTokens on each costRow (an intersection with ShapedHistoryRow, built by object literals with a spread) and hands that row to historyTurnTokens, whose parameter is an inline object type. The flow walk does not pair the argument type's members with the inline parameter type's members, so the write never reaches the parameter's member.

## Why

A dead verdict on a live member is a false delete: removing the read would drop frame overhead from the history budget.

## Done when

The flow walk pairs an argument's members with an inline object parameter's members, historyTurnTokens.extraTokens leaves the dead list on the real tree, a planted case with an intersection-typed argument and an inline parameter is red without the change, and a negative twin whose argument never sets the member stays dead.

## Evidence

Filled at landing: what ran and where its output is.
