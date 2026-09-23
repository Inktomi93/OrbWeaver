---
kind: bug
status: open
updated: 2026-09-23
---

# Emit connectionsChanged from the per-user connection verbs

## What

Per-user, owner-scoped connection CRUD exists in packages/server/src/domain/connection/verbs/connections.ts, but it never calls emitUserEvent. connectionsChanged is declared at packages/contracts/src/user-bus/index.ts:113,135,170 and the header at :15 says it is DECLARED but not yet emitted. The client maps it at packages/client/src/data/invalidation.ts. Add an emit to each connection mutation (create, update, remove, binding changes) and remove the deferral.

## Why

An edit to a connection on one device never refreshes the Connections pane on another tab or device. grep of connections.ts for emitUserEvent returns nothing, confirming the gap is live today.

## Done when

Every connection mutation emits connectionsChanged. A test proves a second subscriber receives the event after a connection update.

## Evidence

Filled at landing: what ran and where its output is.
