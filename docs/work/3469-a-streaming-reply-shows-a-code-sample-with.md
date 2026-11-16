---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# A streaming reply shows a code sample with its tags and CSS stripped until it settles

## What

`heldGhostText` in `packages/client/src/features/chat/components/ghost-message-row.tsx` holds markup and strips tags from the forming text when a display script may draw markup. It does the same inside a Markdown code block, so an HTML sample streams with its tags and CSS removed and appears whole only when the reply settles.

## Why

A reader asking a character for HTML watches a gutted sample form, in any room with a markup-drawing display script.

## Done when

Text inside a Markdown code block or code span streams as written on a held row, and a component test on the forming row shows the sample's tags while it streams.

## Evidence

Filled at landing: what ran and where its output is.
