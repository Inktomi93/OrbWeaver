---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# The broker's refusal of a plugin call whose share is full has no deterministic case

## What

forwardAsyncBridge and forwardSyncBridge refuse a Worker's call back to it when its runtime's share of the broker's queue is full. No test edge fills the broker's own hop, so the refusal is reached only under a real flood, and no case asserts that a guest leaving that refusal uncaught takes no strike.

## Why

A change that charged or excused a strike on that path would pass every test.

## Done when

A test edge holds the broker's hop to the watchdog full, and a case shows an uncaught share-full call refusal takes no strike while the plugin's own throw does.

## Evidence

Filled at landing: what ran and where its output is.
