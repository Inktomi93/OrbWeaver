---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: ui
---

# Disabled control opacity moved 50 to 55: confirm the look and run wider CTs

## What

opacity.disabled in packages/ui/src/tokens/tokens.json moved 50 to 55 so fill-less styles clear the 3:1 inactive-control floor in every tone.

## Why

Every disabled control in the app is slightly less dimmed; CTs that assert a disabled opacity were not run in this lane.

## Done when

The orchestrator's whole CT run is green on the 55 step and the owner has seen a disabled control.

## Evidence

Filled at landing: what ran and where its output is.
