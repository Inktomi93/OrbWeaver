---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# Inline event handler attributes do nothing inside a framed reply or card at the interactive step

## What

The frame's Markdown render in `packages/ui/src/markdown/frame/` drops inline event handler attributes, so a panel that uses them does nothing at the interactive step, where a script element does run. Measured through the frame render.

## Why

Models write inline handlers for small interactions, and the interactive step already allows the same code in a script element.

## Done when

A ruling on whether inline handlers run at the interactive step. If yes, the frame keeps them at that step only, with a component test and a security review.

## Evidence

Filled at landing: what ran and where its output is.
