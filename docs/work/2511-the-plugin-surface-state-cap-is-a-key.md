---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: plugins
---

# The plugin surface-state cap is a key count where a byte budget or a per-room eviction was proposed

## What

packages/server/src/domain/plugin/substrate/surface-state.ts caps a plugin's surface state by a count of keys. Its comment recorded a parked revision: a per-plugin byte budget, or least-recently-used eviction over rooms, in place of the key count. The comment cited a board row that is not in docs/work, so the proposal had no home once the comment sweep removed the cite.

## Why

A key count bounds neither memory nor the number of rooms a plugin can hold state for. The proposal was parked, not rejected, and a parked design with no record is lost.

## Done when

A recorded decision keeps the key count with its reason, or the cap is rebuilt as the chosen alternative with a test at the bound. The comment cites the decision.

## Evidence

Filled at landing: what ran and where its output is.
