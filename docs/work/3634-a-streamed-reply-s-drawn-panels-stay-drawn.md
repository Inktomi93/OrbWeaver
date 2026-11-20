---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: chat-html-and-presets
---

# A streamed reply's drawn panels stay drawn when the reply settles

## What

While a reply streams, each complete panel draws in a forming frame. When the reply settles, the streaming row and the settled row are different list items, so the forming frames unmount and the panels show chips until the settled frame draws.

## Why

Panels the reader already sees blink back to chips at the end of every styled reply.

## Done when

The drawn panels stay on screen until the settled reply frame has drawn, with no extra mint beyond the stated budget, proven by a component test that streams a two-panel reply and samples the panels across settle.

## Evidence

Filled at landing: what ran and where its output is.
