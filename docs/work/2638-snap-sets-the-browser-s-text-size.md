---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: surface-walk
---

# Snap sets the browser's text size

## What

pnpm snap has no flag for the browser's text size. A rendered review at enlarged text has to set it through the session's DevTools endpoint by hand, the door tests/support/browser/platform-text-size.ts uses, and one review attempt ran without the override applied and had to be discarded.

## Why

Enlarged text is where most of today's rendered defects were found, and the instrument cannot ask for it.

## Done when

Snap takes a text-size argument that applies the same override the platform text-size helper uses, records it in run.json, and a run at an enlarged size is distinguishable from a default one in the report.

## Evidence

Filled at landing: what ran and where its output is.
