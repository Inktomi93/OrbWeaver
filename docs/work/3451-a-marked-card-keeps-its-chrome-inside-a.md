---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: cross-surface-consistency
---

# A marked card keeps its chrome inside a styled reply

## What

`replyParts` in `packages/client/src/features/chat/lib/reply-parts.ts` carries a card inside a styled reply as a frame segment, and `reply-frame.tsx` draws it as raw markup in the reply's frame. The card loses its title bar, collapse, view source and fullscreen, and only its HTML is carried. Owner ruling: a card written as a card (`:::card`) keeps its chrome wherever it sits; markup a display script wrote stays part of the reply and gets no card chrome.

## Why

The same card behaves two ways for a reason the reader cannot see, and view source is how a reader checks what a card holds.

## Done when

A marked card in a styled reply renders through `CardBlock` in its own frame with its chrome and its own CSS, the way media and choices already split the reply's frame run. Script-written markup still draws in the reply frame with no chrome. A component test mounts a styled reply holding a marked card and a script panel and asserts both.

## Evidence

Filled at landing: what ran and where its output is.
