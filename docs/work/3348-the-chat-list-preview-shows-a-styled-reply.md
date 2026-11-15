---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: import-robustness
---

# The chat list preview shows a styled reply as text, not markup

## What

The chat list's last-message preview shows the raw markup of a reply that a display script styles.

## Why

The list shows tag soup for every chat that uses a styled preset.

## Done when

A case reads the list preview for a chat whose last reply a display script styles and gets the visible words only, with no tag, attribute or style text; a CT shows the row.

## Evidence

Filled at landing: what ran and where its output is.
