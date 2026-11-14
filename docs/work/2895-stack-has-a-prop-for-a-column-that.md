---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Stack has a prop for a column that may shrink below its content

## What

A column that must shrink inside a row spells the shrink as a class on `Stack` at many client sites, among them `packages/client/src/features/discovery/components/corpus-controls.tsx` and `packages/client/src/components/list-page.tsx`. The width helper in `packages/ui/src/lib/width.ts` names the shrink for height and has no name for width.

## Why

Layout is a primitive prop that names a design idea; a class repeated by hand at each site is forgotten at the next one, which is how the corpus finder came to scroll sideways.

## Done when

`Stack` and `Row` take the shrink as a named prop from one owner, every hand-spelled site moves to it by codemod, and a lint or census refuses the class on a layout primitive.

## Evidence

Filled at landing: what ran and where its output is.
