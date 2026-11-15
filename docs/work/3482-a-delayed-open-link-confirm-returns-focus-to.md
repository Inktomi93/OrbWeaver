---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A delayed open-link confirm returns focus to the card, not to where the reader was

## What

A paced open-link request raises its confirm later with no reader action, and when it closes focus lands on the card root. A reader who has moved to the composer loses their place.

## Why

A frame's earlier request moves the reader's focus.

## Done when

A paced confirm returns focus to the element focused when it opened, when that element is still connected and outside any frame. A component test covers it.

## Evidence

Filled at landing: what ran and where its output is.
