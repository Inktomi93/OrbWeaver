---
kind: work
status: open
updated: 2026-10-12
priority: P3
---

# Raw Dialog sites become viewer, picker and flow composites

## What

Thirteen client features mount the raw @orb/ui Dialog because no composite fits them; they sit as deferred exemptions in the eslint.config.js RESTRICTIONS table under dialog-via-composite. Build three composites (a content viewer, a picker, a multi-step flow) and move each site onto one: viewer for variant-wire-viewer, member-card-viewer, rpg-scene-cards, gallery-lightbox; picker for character-gallery-dialog, gallery-add-picker, reaction-picker, databank-character-attachments, persona-from-character-dialog, persona-connected-characters; flow for join-invite-dialog, modal-host, variable-editor-dialog.

## Why

A raw dialog in a feature re-implements focus, sizing and dismissal per site; a composite gives every viewer, picker and flow the same behaviour.

## Done when

The three composites exist in packages/client/src/components beside ConfirmDialog and FormDialog, built over the @orb/ui dialog door, each with a CT; every listed site uses one; the deferred entries are gone from the RESTRICTIONS table; a side-eye pass covers each surface.

## Evidence

Filled at landing: what ran and where its output is.
