---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: security
plan: authorization-and-visibility
---

# A plugin guest's host calls refuse a disabled installer

## What

A running plugin guest could keep calling host operations that reach its installer's account after that account was disabled: chat reads and writes, model calls, fetches, world info and card data. Every guest host call passes `dispatchBridgeCall` in `packages/server/src/infra/plugin-host/bridge-rpc.ts`.

## Why

A disabled account must not act or spend through a plugin that was already loaded when it was disabled.

## Done when

The dispatch awaits the installer's standing before any operation that reaches the installer's account, a table classifies every bridge operation and fails typecheck when one is missing, and a test shows a running guest's model call refused for a disabled installer.

## Evidence

Filled at landing: what ran and where its output is.
