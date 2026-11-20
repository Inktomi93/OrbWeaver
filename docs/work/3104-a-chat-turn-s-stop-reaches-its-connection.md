---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# A chat turn's Stop reaches its connection resolve and its context gather

## What

The send, regenerate and continue verbs resolve the connection and gather recall and databank context before activeTurns.register creates the Stop handle (`packages/server/src/domain/chat/active-turns.ts`), so those calls run under ctx.backgroundSignal and only shutdown can end them. The edit verb's re-apply and selection-bake gathers use the same signal.

## Why

A user who presses Stop while a sleeping model wakes or a recall embed runs waits for that call to finish before the turn ends.

## Done when

The turn's abort controller exists before the resolve and the gather, both take its signal, and a test that presses Stop during a held resolve sees the provider call aborted.

## Evidence

Filled at landing: what ran and where its output is.
