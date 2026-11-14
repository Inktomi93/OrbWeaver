---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Menu rows wrap their label inside the popup at enlarged text

## What

In the composer tools menu on a phone at 300% text, a menu item's text and a submenu trigger's chevron are wider than the popup, so the popup scrolls sideways. The row recipes are in `packages/ui/src/primitives/menu/variants.ts`.

## Why

A menu that scrolls sideways hides the end of its rows and the submenu cue.

## Done when

A component test in `tests/ui/primitives/menu/` mounts a menu with a long item label and a submenu trigger in a 390px viewport at 300% text. It asserts that the popup does not scroll sideways, the label wraps and the chevron stays inside the row. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
