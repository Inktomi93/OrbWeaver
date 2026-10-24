---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: server
plan: test-foundation
---

# Wire-capture and turn-outcome rings move onto each root

## What

After item 1305 the log, request and trace rings, audit counters and instance id belong to each root, but the wire-capture and turn-outcome rings in packages/server/src/foundation/observability/debug/wire-capture.ts are still module singletons, so two roots in one worker share provider captures.

## Why

A test root reading its provider captures can see another root's, which is the same leak 1305 closed for the other rings.

## Done when

Each root builds its own wire-capture and turn-outcome rings at the composition root and passes them to their writers and debug readers; no module holds them; a two-root proof like root-isolation.int.test.ts shows them separate and fails when they are shared again.

## Evidence

Filled at landing: what ran and where its output is.
