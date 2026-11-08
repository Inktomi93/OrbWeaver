---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: surface-walk
---

# Snap map reads a disabled fieldset's controls as disabled, not refused

## What

Snap --map refuses every button inside a disabled fieldset, because stateOf in tooling/src/snap/lib/map-browser.ts reads el.disabled.

## Why

A wrong map state sends an agent after controls that are disabled by design.

## Done when

The map reports the fieldset's controls as disabled with the reason, with a test.

## Evidence

Filled at landing: what ran and where its output is.
