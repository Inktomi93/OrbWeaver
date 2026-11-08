---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
plan: surface-walk
---

# Home quick picks scroll sideways at 200% text

## What

On the desktop-1440-all-panes-text200 Home walk, the quick-picks grid scrolls horizontally instead of reflowing.

## Why

Content that needs sideways scrolling at 200% text fails the reflow expectation for enlarged text.

## Done when

The quick-picks grid reflows at 200% and 300% text with no horizontal scroll, or a cited design ruling exempts it, with the text projects' geometry finding gone.

## Evidence

Filled at landing: what ran and where its output is.
