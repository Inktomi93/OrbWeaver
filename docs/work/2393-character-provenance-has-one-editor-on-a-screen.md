---
kind: bug
status: open
updated: 2026-11-10
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

Provenance is edited in one place and shown read-only or not at all in the other, with a production-mounted CT asserting a single editable input per provenance field, and the duplicate-action-door finding is gone from the character editor evidence case.

## Evidence

Filled at landing: what ran and where its output is.
