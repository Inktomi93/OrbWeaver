---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: kit
---

# Two escaped-character shapes still hide a style element from the Markdown reader

## What

The Markdown reader in `packages/kit/src/content/index.ts` and the renderer disagree on two shapes found by a differential run. A backslash before a style opener on an HTML block line: the reader takes the backslash as an escape and Markdown does not escape inside an HTML block. A backslash before a backtick that the reader takes as opening a code span. The reader also takes a style close followed by a non-breaking space as a close, which HTML does not, so the plain path leaves that element's tail visible. No ordinary panel reaches any of them.

## Why

They are known shapes where a stylesheet can print as text on the plain path.

## Done when

The reader follows the renderer on each shape, with rows under `tests/kit/content/` checked against the real render.

## Evidence

Filled at landing: what ran and where its output is.
