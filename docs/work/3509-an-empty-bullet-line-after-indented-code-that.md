---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: kit
plan: chat-html-and-presets
---

# An empty bullet line after indented code that closed a container can print a panel's stylesheet on the plain path

## What

The Markdown reader in `packages/kit/src/content/index.ts` and the renderer disagree on one shape: an empty bullet item directly after an indented code line that closed a container, followed by a code block opener. The renderer opens the list only when the code line closed a container. A differential run finds about one such miss in twenty thousand random inputs. On the plain path the panel's stylesheet then prints as text.

## Why

It is the last known shape where the reader and the renderer disagree on what is a style element.

## Done when

The reader follows the renderer on the shape, with rows under `tests/kit/content/` checked against the real render, and the differential run reports no miss of this class.

## Evidence

Filled at landing: what ran and where its output is.
