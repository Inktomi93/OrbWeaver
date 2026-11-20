---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# A framed link string has no length bound before it is parsed

## What

`readCardFrameLink` in `packages/ui/src/content/sandbox-frame/sandbox-frame.tsx` runs on every frame message before the press and focus checks, and parses a link string of any length.

## Why

A frame can make the reader's own tab do work in proportion to a string it posts.

## Done when

A link string past a stated bound is refused before it is matched, and a test covers the bound.

## Evidence

Filled at landing: what ran and where its output is.
