---
kind: work
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# The plugin host's call deadline rejects with a named error

## What

The membrane rejects a host call that outlives its deadline with a plain Error (membrane.ts near the requestTurn bound), so Keepsake Camera times the call and Story Clocks matches the message suffix to tell a deadline from a refusal.

## Why

Plugins guess at a failure the host could name.

## Done when

A deadline rejection carries a stable error name the SDK documents, and the two showcase plugins read the name instead of timing or text.

## Evidence

Filled at landing: what ran and where its output is.
