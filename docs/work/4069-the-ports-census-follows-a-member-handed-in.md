---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The ports census follows a member handed in as a call argument, and the live bus types publishChatChanged as its op

## What

Compose hands LiveBuses.user.publishChatChanged, which restates PublishChatChangedOp, into a parameter typed as that op (packages/server/src/entry/compose/services.ts into createEmitChatChanged in chat.ts). The ports census does not follow a function-argument flow through a member hop, so it lists the pair as review instead of a true restatement.

## Why

A restated op signature drifts from its owner, and a census that cannot see member-argument flows misses every such restatement.

## Done when

The bus member is typed as PublishChatChangedOp, the ports census follows a member passed as a call argument with a red-first case, and ports reports no review target for the pair.

## Evidence

Filled at landing: what ran and where its output is.
