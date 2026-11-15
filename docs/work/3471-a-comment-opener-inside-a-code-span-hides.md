---
kind: bug
status: doing
updated: 2026-11-15
priority: P3
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# A comment opener inside a code span hides a real style element from the inert strip

## What

The kit raw-text reader in `packages/kit/src/content/index.ts` skips from any `<!--` to `-->`, including one written inside a code span, so a real style element between them is kept by the inert strip and its CSS prints as prose.

## Why

It is the stylesheet-as-prose fault in another shape on the inert path.

## Done when

The comment skip ignores an opener inside a code span, or the reader's header records the residual with its reason, and a kit test under `tests/kit/content/` has a row for it.

## Evidence

Filled at landing: what ran and where its output is.
