---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: appearance
---

# Every appearance invariant row's subjects render in the product

## What

tests/client/features/chat/components/appearance-row-subjects.ct.tsx proves the chat rows' subject selectors match the rendered transcript. The shell and config-sizing rows in packages/client/src/lib/appearance-invariant-manifest.ts have no test that their selectors match the rendered shell or sizing dialog.

## Why

A product change that renames or restructures a subject leaves the manifest selector matching nothing, and the rated matrix then refuses every later cell. That is how the chat rows sat broken after a product change, with nothing failing until a release-gate run.

## Done when

A CT per surface mounts the production shell or the Appearance sizing dialog and requires every subject of that surface's rows to render, red against a renamed slot.

## Evidence

Filled at landing: what ran and where its output is.
