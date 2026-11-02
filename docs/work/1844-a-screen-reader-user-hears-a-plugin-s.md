---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: plugin
---

# A screen-reader user hears a plugin's free-text title on its suggestion card but never hears the installer

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
- What: a screen-reader user hears a plugin's free-text title and never hears the installer. The dismiss button's accessible name is `Dismiss ${title}` (`packages/client/src/features/chat/components/chat-controls-band.tsx:265-266`), and the byline is in no accessible name. So a name like `Dice” (installed by owner)…` still reads as an attribution.
- Done: the byline is part of the card's accessible description (for example `aria-describedby`), and a CT asserts it.
