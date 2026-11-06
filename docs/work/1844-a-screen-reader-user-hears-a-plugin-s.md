---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: plugin
plan: cross-surface-consistency
---

# A screen-reader user hears a plugin's free-text title on its suggestion card but never hears the installer

## What

Make the installer byline part of a plugin suggestion card's accessible description.

## Why

The dismiss button's accessible name is Dismiss plus the plugin's free-text title, and the byline is in no accessible name. A title that mimics an attribution reads to a screen-reader user as one, and the installer is never heard.

## Done when

The byline is in the card's accessible description, for example through aria-describedby, and a component test asserts it.

## Evidence

Filled at landing: what ran and where its output is.

- What: a screen-reader user hears a plugin's free-text title and never hears the installer. The dismiss button's accessible name is `Dismiss ${title}` (`packages/client/src/features/chat/components/chat-controls-band.tsx:265-266`), and the byline is in no accessible name. So a name like `Dice” (installed by owner)…` still reads as an attribution.
- Done: the byline is part of the card's accessible description (for example `aria-describedby`), and a CT asserts it.
