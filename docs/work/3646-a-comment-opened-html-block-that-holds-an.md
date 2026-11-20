---
kind: bug
status: doing
updated: 2026-11-20
priority: P3
area: kit
lane: wt/agent-a4d098f9b2f799d95
plan: chat-html-and-presets
---

# A comment-opened HTML block that holds an svg is a model panel

## What

isPanelBlock returns false for a block that opens with an HTML comment even when an svg follows on the same line, so that panel is not framed.

## Why

A model panel drawn as plain markup loses its frame.

## Done when

The panel trigger reads the block past its leading comment, with a test.

## Evidence

Filled at landing: what ran and where its output is.
