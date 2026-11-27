---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: server
lane: wt/agent-adb68c6b9e2624d09
plan: unwired-code
---

# Wire or delete the asset rebuild-from-tree recovery verb

## What

assets.rebuildFromTree, a disaster-recovery verb, has no production caller.

## Why

Unwired code is a question about intent: a recovery path nobody can run is no recovery.

## Done when

The verb has a production entry with a test that drives it, or it is deleted with the reason recorded after its history is read.

## Evidence

Filled at landing: what ran and where its output is.
