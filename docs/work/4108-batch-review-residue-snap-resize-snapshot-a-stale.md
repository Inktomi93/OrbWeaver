---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: tooling
---

# Batch review residue: snap resize snapshot, a stale cite and the no-op detach

## What

From the seven-lane cleanup review: snap's capture and scenario code snapshot the environment contract before a resize (tooling/src/snap capture.ts and scenario.ts); a stale line cite in prod-support.ts; no test observes that a no-op regex or world-info detach emits nothing.

## Why

Each leaves a wrong reading or an unproven behaviour that the next change could break silently.

## Done when

Capture and scenario read the contract after any resize, the cite names the current line, and an int test asserts a no-op detach emits no event.

## Evidence

Filled at landing: what ran and where its output is.
