---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A comment block that holds a blank line splits into bubbles and shows text the single bubble hides

## What

In the trains layout a reply paragraph split falls inside an HTML comment that holds a blank line. The later bubble then shows the comment's tail as text, where the reply drawn as one bubble hides it. The split lives in `packages/client/src/features/chat/lib/split-paragraphs.ts`.

## Why

The trains layout shows text the author hid.

## Done when

No split falls inside a comment, with a row under `tests/client/features/chat/lib/`.

## Evidence

Filled at landing: what ran and where its output is.
