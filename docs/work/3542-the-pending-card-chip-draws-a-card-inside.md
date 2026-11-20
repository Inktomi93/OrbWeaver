---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# The pending card chip draws a card inside the card chrome

## What

While a card forms, its chip is drawn as a bordered surface inside the card's own chrome.

## Why

Nested card surfaces break the surface rules the design law sets.

## Done when

The pending state uses a surface the design law allows inside a card.

## Evidence

Filled at landing: what ran and where its output is.
