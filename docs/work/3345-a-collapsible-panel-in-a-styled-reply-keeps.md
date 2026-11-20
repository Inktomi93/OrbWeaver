---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: chat
lane: wt/agent-a8c72080671572f19
plan: import-robustness
---

# A collapsible panel in a styled reply keeps its open state when its row leaves and returns

## What

A panel a reader opened inside a framed reply closes again when the row scrolls out of the list and back, and when the reader swipes to another version and back. It survives a new message.

## Why

A reader who opened a status panel loses their place by scrolling.

## Done when

A CT opens a panel in a framed reply, scrolls the row out and back, and swipes away and back; the panel is still open each time.

## Evidence

Filled at landing: what ran and where its output is.
