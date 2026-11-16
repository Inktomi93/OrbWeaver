---
kind: bug
status: open
updated: 2026-11-16
priority: P1
area: chat
plan: chat-html-and-presets
---

# Card frames clip their content by the first and last element's margins

## What

A card frame sizes itself from the body's scroll height in `packages/kit/src/card-frame/index.ts`. The frame body has no margin, no padding and no formatting context, so the margins of its first and last children collapse through it and are not counted. A card whose first or last element is a paragraph or heading is cut short. Transcript cards and the card archive share the frame.

## Why

The last line of a model's card is hidden, with no scroll and no hint.

## Done when

The frame body contains its children's margins, a card frame is as tall as its content, and a reply frame's height is unchanged. A component test serves a card whose first and last children carry margins and asserts the frame's height from the resolved values.

## Evidence

Filled at landing: what ran and where its output is.
