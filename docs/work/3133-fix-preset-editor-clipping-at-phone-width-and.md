---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Fix preset editor clipping at phone width and the library row glyph line

## What

At phone width the editor's view strip clips the last tab label at the right edge and the Top-K number box clips its 'default' placeholder. In the library list the built-in row's lock glyph sits on a line of its own between name and subtitle, and an imported row's subtitle reads 'generation' where the others read 'roleplay'.

## Why

Clipped labels and a stray glyph line read as broken layout; the kind word is jargon the user never chose.

## Done when

Phone renders the full last tab label and placeholder, the lock glyph sits inline, and the imported row's kind word matches the library's vocabulary.

## Evidence

Filled at landing: what ran and where its output is.
