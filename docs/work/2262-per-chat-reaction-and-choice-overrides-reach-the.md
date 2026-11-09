---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: chat
plan: unwired-code
---

# Per-chat reaction and choice overrides reach the turn

## What

chatMetadataSchema.charactersCanReact, .offerChoices and .reactionsEnabled are per-chat overrides with same-named settings, but the unwired scan finds no flow from the chat metadata field to the code that reads the setting, so a per-chat override may be stored and never applied.

## Why

A per-chat switch that saves but never changes the turn is a broken control.

## Done when

Each override is traced from its write to the turn's read: wired so the chat value wins over the setting with a test through the real send path, or removed with its UI if no ruling keeps it.

## Evidence

Filled at landing: what ran and where its output is.
