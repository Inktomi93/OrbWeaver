---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: client
---

# Wire or remove the unwired databank and discovery procedures

## What

`pnpm ast unwired` lists tRPC procedures that no client code calls. Item 0019 covers the connection
procedures. The rest:

- `databank.attachToCharacter` and `databank.detachFromCharacter` in
  `packages/server/src/transport/trpc/routers/databank.ts`.
- `discovery.swipeHotspots` and `discovery.similarChats` in
  `packages/server/src/transport/trpc/routers/discovery.ts`.

For each, decide from the server code whether a user needs it. Wire it into a client surface with a test,
or delete the procedure with its service verb, router test and cross-tenant sweep entry. Record the reason.
Also check `GlobalVariableView`, `ViewerView` and `PresenceView`, which `pnpm ast clientgap contracts`
reports as shapes the client never reads. That command reports candidates, so verify each before acting.

## Why

An unused procedure widens the tRPC surface and the cross-tenant sweep with no product caller. It can also
be a finished server feature that users cannot reach.

## Done when

`pnpm ast unwired` lists no databank or discovery procedure. Each wired procedure has a test that renders
its result. Each checked contract shape is read by the client or has a recorded reason.

## Evidence

Filled at landing: what ran and where its output is.
