---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# A new server lint block cannot drop a shared import restriction unseen

## What

Each server lint home block names by hand the door it lifts from the shared import restriction list, and the test samples a few paths. A new home block outside them could lift the visibility minter restriction with no failure. The item that restored the restriction said dependency-cruiser also refuses that import; no dependency-cruiser rule that does so was found, so the lint rule may be the only guard.

## Why

The guard depends on hand-kept lists and may have no second line.

## Done when

One table maps each restriction to its home, a test sweeps every server directory against it, and the report states whether a dependency-cruiser rule also refuses the minter import, adding one if none does.

## Evidence

Filled at landing: what ran and where its output is.
