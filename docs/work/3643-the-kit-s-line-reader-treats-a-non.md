---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: kit
lane: wt/agent-a4d098f9b2f799d95
plan: chat-html-and-presets
---

# The kit's line reader treats a non-breaking space as CommonMark does

## What

The kit content readers take U+00A0 as indentation and blank space, while CommonMark does not, so HTML block starts and blank lines are misread on every reading the kit makes. It overlaps the non-breaking space clause of 3513.

## Why

Block structure disagrees with what the renderer draws, on the trust boundary.

## Done when

The kit line reader follows CommonMark on U+00A0, with rows checked against the real render.

## Evidence

Filled at landing: what ran and where its output is.
