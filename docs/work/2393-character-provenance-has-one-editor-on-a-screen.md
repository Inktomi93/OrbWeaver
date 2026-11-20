---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# Character provenance has one editor on a screen

## What

The character editor shows the provenance fields (creator, card version) as editable inputs in both character-facet-editor.tsx and the facet inspector's ProvenanceDetail at the same time.

## Why

Two live editors for one field on one screen can show diverging drafts and double the controls a user must scan.

## Done when

The duplicate-field finding is gone from the character editor evidence case of a design-audit run. Already merged: Provenance is edited in the facet editor and read-only in the detail panel, with `tests/client/features/app-shell/surfaces/character-provenance-single-editor.ct.tsx`. Both panes still render the import and refinery tail; that is ruled out of this item or filed.

## Evidence

Filled at landing: what ran and where its output is.
