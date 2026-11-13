---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: ui
plan: cross-surface-consistency
---

# The lightbox has an accessible name and asks about external media once

## What

The lightbox dialog in `packages/ui/src/content/lightbox/lightbox.tsx` has no accessible name, and it asks whether to load external media again for an image the reader already loaded inline.

## Why

A screen-reader user hears an unnamed dialog, and the same consent is asked twice.

## Done when

The dialog is named for what it shows, an image already loaded inline opens without the question, and component tests cover both.

## Evidence

Filled at landing: what ran and where its output is.
