---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# A styled panel inside a list item is read as indented code and its stylesheet prints as prose

## What

The kit's Markdown-mode reader in `packages/kit/src/content/index.ts` counts any line indented four spaces after a blank line as an indented code block. Inside a list item Markdown measures indentation from the item's content, so that line is the item's own HTML. A panel there is not lifted, carried or stripped, and its stylesheet prints as prose on the framed and the plain path. The fault is on the lane branch only.

## Why

It returns the stylesheet-as-prose fault for any panel a script or model writes inside a list.

## Done when

Indentation is measured against the enclosing list item or block quote, and a panel inside a bulleted and a numbered item is lifted and stripped as it is at top level. A test covers both and a real indented code block.

## Evidence

Filled at landing: what ran and where its output is.
