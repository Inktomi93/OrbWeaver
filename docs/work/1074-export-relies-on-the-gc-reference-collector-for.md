---
kind: work
status: open
updated: 2026-10-19
priority: P3
area: server
---

# Export relies on the GC reference collector for inline refs

## What

verbs/export-assets.ts and persistence/portable-refs.ts scan message bodies for inline asset refs a second time, beside the reference collector that now covers them.

## Why

One home per concept; two body scans can drift apart.

## Done when

The export uses the collector alone, and selectInlineReferencedContents and its extra loop are deleted.

## Evidence

Filled at landing: what ran and where its output is.
