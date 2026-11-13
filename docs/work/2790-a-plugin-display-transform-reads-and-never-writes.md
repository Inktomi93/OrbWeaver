---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A plugin display transform reads and never writes or spends

## What

A display call reaches every bridge operation not tied to a chat on its grant alone, including storage writes and spend (`packages/server/src/infra/plugin-host/bridge-rpc.ts`). A read call can also consume a strike a stalled write left owed. Only the installer's own client reaches it. Ruling: display is a read path. Each row of the bridge operation reach table gains an effect (read, write or spend), exhaustive over the operation union by type and classified by reading each handler; a display call admits read only; the rehydration read set is derived from the table or held to it by type, never a second hand list. A shipped display transform that relies on a write or spend is listed, not excepted.

## Why

A transform that runs on every render must not mutate or spend.

## Done when

Each write and spend class is refused from a display call while the same operation succeeds from a command, and a read call leaves an owed strike untouched.

## Evidence

Filled at landing: what ran and where its output is.
