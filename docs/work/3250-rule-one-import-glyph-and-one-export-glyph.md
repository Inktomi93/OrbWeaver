---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Rule one import glyph and one export glyph for every door in the design system

## What

The Presets import door (band icon and empty state) now wears FileInput, a page with an arrow going in, added to the icon allowlist in packages/ui/src/primitives/icons/index.ts. Every other import door still wears Upload: chat band, character band and landing, persona list, appearance looks, config collection landing, library import. Export doors wear Download (preset row menu, world-info rows, theme row menu, chat row menu, persona editor, regex rows, library export). The first-user review of the Presets page read Upload on Import as export or share. Sites still on Upload: packages/client/src/features/chat/hooks/use-chat-list-header.tsx, packages/client/src/features/character/components/character-create-actions.tsx, packages/client/src/features/character/lib/character-door-forms.ts, packages/client/src/features/persona/components/persona-list.tsx, packages/client/src/features/config/components/appearance-looks-section.tsx, packages/client/src/features/config/components/config-collection-landing.tsx, packages/client/src/features/workloads/components/export-library-section.tsx (verify each against the glyph it wears before moving it). Upload is also the file dropzone's glyph and the picture button's, where it means send a file and is right. Recommendation: FileInput for every import door, Download or FileOutput for export, Upload kept for dropzones and picture pickers.

## Why

A glyph that reads as the opposite verb to some users is a design-system question, not a per-pane one. With the Presets door changed alone, one app has two import glyphs.

## Done when

The design-system law names the import glyph and the export glyph. Every import door above uses it in one change, and the surface that tests a door's glyph asserts it by the icon component.

## Evidence

Filled at landing: what ran and where its output is.
