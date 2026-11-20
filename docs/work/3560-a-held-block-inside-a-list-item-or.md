---
kind: bug
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-a4d098f9b2f799d95
plan: chat-html-and-presets
---

# A held block inside a list item or quote keeps its container

## What

The block hold writes its blank-line marker at the start of the line inside a list item, which ends the item in the frame's parse.

## Why

A panel inside a list item draws split.

## Done when

The marker keeps the line's container indent, or a block inside a container is not held; a kit row, and the seeded differential gains list and quote fragments.

## Evidence

Filled at landing: what ran and where its output is.
