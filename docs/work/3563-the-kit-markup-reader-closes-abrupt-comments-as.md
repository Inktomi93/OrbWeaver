---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: kit
plan: chat-html-and-presets
---

# The kit markup reader closes abrupt comments as HTML does

## What

The kit reads an abruptly closed comment as an open one and runs it to the next closer, so a style element after it is live in a frame but uncounted by the panel reader and the carried stylesheets. Character data sections and processing instructions over-count instead.

## Why

The trigger and the carry disagree with the frame's parse. Fidelity only; nothing reaches the app page.

## Done when

The reader closes abrupt comments as HTML does and reads character data sections, processing instructions and bogus comments as bogus comments; kit cases for each, red on the parent.

## Evidence

Filled at landing: what ran and where its output is.
