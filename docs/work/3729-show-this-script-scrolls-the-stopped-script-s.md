---
kind: bug
status: doing
updated: 2026-11-21
priority: P1
area: chat
lane: wt/agent-aec8c86f55b5b291c
plan: chat-html-and-presets
---

# Show this script scrolls the stopped script's row into view and focuses it

## What

The regex stop notice's Show this script leaves the row off screen on a phone and cut off on desktop, and focus stays on the page body. Folds 3706.

## Why

The action the notice offers does not reach its target.

## Done when

The row is fully in view and focused on phone and desktop, for a roster row and a prompt-only tier row, with a platform CT on WebKit and a Chromium CT.

## Evidence

Filled at landing: what ran and where its output is.
