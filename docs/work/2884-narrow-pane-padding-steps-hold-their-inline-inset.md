---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Narrow-pane padding steps hold their inline inset at enlarged text

## What

The padding props hold the inline inset at the block and section steps, so a box does not lose reading width as text grows. The narrow-pane steps in `packages/ui/src/layout/variants.ts` still grow with the text, and the reach pairing in `packages/ui/src/lib/reading-inset.ts` reads them.

## Why

A pane that uses a narrow-pane step loses reading width at enlarged text on a phone, where the held steps beside it do not.

## Done when

A component test on a production pane that uses a narrow-pane step measures the same inline inset at default and enlarged text on a phone, red before and green after, and the inset at default text is unchanged.

## Evidence

Filled at landing: what ran and where its output is.
