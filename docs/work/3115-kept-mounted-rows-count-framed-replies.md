---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Kept-mounted rows count framed replies

## What

live-card-rows.ts judges keep-mounted from raw message content, so a row that renders as a reply frame (a display script's markup) is not kept mounted the way a card row is, and scrolling it out and back re-mints its frame.

## Why

A re-mint costs a mint round trip and a height swap on every scroll-back past a framed reply.

## Done when

A framed reply row is kept mounted under the same rule as a card row, proven in a CT that scrolls a framed reply out and back and counts one mint.

## Evidence

Filled at landing: what ran and where its output is.
