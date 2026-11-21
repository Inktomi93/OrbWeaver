---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# Browser tests and snap type their agent bridge calls

## What

The dev window.\_\_orb bridge handles (packages/client/src/lib/agent-bridge.ts and its siblings) are called from page.evaluate strings in snap and the browser tests, and nothing outside tooling/src/unwired/deliberate.ts names their types, so the unwired scan excuses them as deliberate entries.

## Why

A renamed or removed bridge accessor fails only at run time, and the scan cannot tell a used accessor from a dead one.

## Done when

Snap and the browser test support type their bridge calls against the handle types; the agent bridge entries leave deliberate.ts; the member scan reports no new unwired bridge member; a renamed accessor fails tsc.

## Evidence

Filled at landing: what ran and where its output is.
