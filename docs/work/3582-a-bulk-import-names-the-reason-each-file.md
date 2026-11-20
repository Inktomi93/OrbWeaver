---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: import
---

# A bulk import names the reason each file was refused

## What

`packages/server/src/domain/import/substrate/preset.ts:45-49` says a bulk import has no door to render a per-file reason. The single-file door prints it. Carry the reason on the bulk result and render it.

## Why

A user importing a folder sees which files failed and not why, so cannot fix them.

## Done when

The bulk import result lists the reason beside each refused file, and a test refuses a file through the bulk door and reads the reason.

## Evidence

Filled at landing: what ran and where its output is.
