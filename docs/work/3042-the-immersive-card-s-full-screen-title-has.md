---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: ui
plan: cross-surface-consistency
---

# The immersive card's full-screen title has no reveal when it is cut

## What

The immersive card's lightbox title in packages/ui/src/content/immersive-card/immersive-card.tsx truncates on one line beside its controls with no way to read the whole label. The dialog and sheet composites now open a cut title through ModalTitle, but the lightbox is drawn in @orb/ui, which cannot reach the client's TitleReveal.

## Why

The reveal rule in ui-platform-rulings §8.2 now covers every dialog title, and this is the one dialog title outside the composites.

## Done when

A cut lightbox title opens its whole text by the press that reaches it, or the lightbox is drawn through a client composite that owns the reveal, with a component test at a short landscape size.

## Evidence

Filled at landing: what ran and where its output is.
