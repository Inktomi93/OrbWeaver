---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: kit
lane: wt/agent-a4d098f9b2f799d95
plan: chat-html-and-presets
---

# The block hold keeps a text element or an unclosed raw-text element whole

## What

A textarea, or an unclosed style or script element, inside a held block keeps its blank lines; the frame's parse splits the block there, and the raw-text lift lifts closed elements only. A sibling of 3560.

## Why

The panel draws split in its frame.

## Done when

Those blank lines are held or lifted, and a check of held ranges against the real parser finds none split.

## Evidence

Filled at landing: what ran and where its output is.
