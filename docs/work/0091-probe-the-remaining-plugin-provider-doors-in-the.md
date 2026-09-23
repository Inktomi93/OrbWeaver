---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: connection
---

# Probe the remaining plugin provider doors in the cross-tenant sweep

## What

The cross-tenant sweep has no probe for credentials.add, connection.update or connection.catalogModels with another user's plugin provider id. The credentials.add test stubs findProvider, so the wiring at entry/compose/services.ts:397 has no integration test.

## Why

These doors are scoped by c26bbc295 but only proven by unit tests; a regression would leak a key to another user's plugin host.

## Done when

Three probe rows in tests/server/transport/cross-tenant-sweep.suite.int.test.ts and an integration test through the real findProvider wiring, each red when the per-viewer scope is removed.

## Evidence

Filled at landing: what ran and where its output is.
