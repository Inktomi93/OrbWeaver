---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# Select, combobox and autocomplete popups cast the float shadow

## What

`POPUP_SURFACE` in `packages/ui/src/lib/popup-surface.ts` carries no shadow, so the select, combobox and autocomplete popups cast nothing while the popover, menu and tooltip cast `--shadow-overlay`.

## Why

ui-surface-and-interaction-rules §2.1 gives every float the one float shadow; the list popups read as flatter than their siblings.

## Done when

The owner has answered the list-popup question in ui-surface-and-interaction-rules §7, and every anchored float follows the answer through one shared recipe.

## Evidence

Filled at landing: what ran and where its output is.
