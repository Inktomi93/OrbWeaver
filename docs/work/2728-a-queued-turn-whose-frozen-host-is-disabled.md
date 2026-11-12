---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a83a3dac07c50924b
plan: authorization-and-visibility
---

# A queued turn whose frozen host is disabled drops at drain, like a hostless room's

## What

Disabling a host evicts their sockets, so a member's send waits in `pending_turns`. The boot drain in `packages/server/src/entry/lifecycle.ts` hands the turn to `packages/server/src/domain/chat/verbs/turn.ts`, which runs it as the frozen host with no enabled check, on the disabled account's connection and credentials. A departed host's queued turn is dropped and the member is told.

## Why

A disabled human is treated exactly like a departed one, and this path spends a disabled account's inference.

## Done when

The drain drops a turn whose frozen host is disabled with the existing consent drop reason, the member is told as for a hostless room, and a test through the real send and boot drain shows no provider request.

## Evidence

Filled at landing: what ran and where its output is.
