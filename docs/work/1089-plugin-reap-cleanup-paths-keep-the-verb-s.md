---
kind: work
status: open
updated: 2026-10-19
priority: P3
area: server
---

# Plugin reap cleanup paths keep the verb's own error under test

## What

The install store-failure, upgrade store-failure and repairAfterFailedSwap reap sites route through reapReleasedAssets but have no test pairing a failed reap with the verb's own error.

## Why

Those paths rely on reading the code; a regression would replace the real failure with a reap error or hide it.

## Done when

Each path has a test where the reap refuses and the verb surfaces its own error.

## Evidence

Filled at landing: what ran and where its output is.
