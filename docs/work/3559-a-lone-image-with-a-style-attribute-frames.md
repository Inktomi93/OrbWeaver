---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A lone image with a style attribute frames a whole reply

## What

The panel reader counts an image tag with a style attribute on its own line as a styled HTML block.

## Why

The reply frames for no panel, and its prose drops to the frame's font.

## Done when

Void media elements do not trigger a frame, with a kit row.

## Evidence

Filled at landing: what ran and where its output is.
