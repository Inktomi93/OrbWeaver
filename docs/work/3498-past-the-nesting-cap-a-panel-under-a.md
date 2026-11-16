---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: kit
---

# Past the nesting cap a panel under a deeply nested list reads as an indented code block

## What

The container reader in `packages/kit/src/content/index.ts` stops opening containers at its depth cap. A panel indented under a list nested past the cap then measures as indented code, so it is not lifted and the strip keeps its style element. Quotes past the cap still lift and strip.

## Why

The reader's header says the cap fails toward recognising a style element.

## Done when

No line reads as indented code once the cap is reached, with a test just under and just over the cap under `tests/kit/content/`.

## Evidence

Filled at landing: what ran and where its output is.
