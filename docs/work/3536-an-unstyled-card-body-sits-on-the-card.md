---
kind: bug
status: open
updated: 2026-11-16
priority: P2
area: chat
plan: chat-html-and-presets
---

# An unstyled card body sits on the card's border

## What

The body of a card in its frame has no inset, so its text touches the card's left border.

## Why

A card looks unfinished beside an ordinary message.

## Done when

The card body takes the inset the design tokens give a card's content, in the transcript and the card archive, and a component test asserts it from the resolved token.

## Evidence

Filled at landing: what ran and where its output is.
