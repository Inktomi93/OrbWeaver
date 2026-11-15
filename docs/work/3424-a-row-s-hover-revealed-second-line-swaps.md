---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# A row's hover-revealed second line swaps in on a touch tap

## What

`ListRow` swaps its subtitle for `subtitleReveal` on bare hover and focus-within (`packages/ui/src/primitives/list-row/variants.ts`, `parts.tsx`). A touch tap sets both, so a character row's tag line turns into its handle and token size while the row opens. Other hover swaps that are not gated to a fine pointer may do the same.

## Why

On a phone a row's text changes under the finger for a moment. The owner reported it from his phone.

## Done when

At a coarse pointer no hover reveal swaps on tap. A fine pointer hover and keyboard focus still reveal. Every hover-driven swap in `packages/ui/src` and `packages/client/src` uses the shared pointer-gated recipe or is listed with the reason it is harmless. A component test under `tests/ui/primitives/list-row/` pins the touch and the hover case.

## Evidence

Filled at landing: what ran and where its output is.
