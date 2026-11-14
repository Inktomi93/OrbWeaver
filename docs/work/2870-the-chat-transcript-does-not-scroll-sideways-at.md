---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# The chat transcript does not scroll sideways at 300% text on a phone

## What

At 300% text on a phone, a text paragraph in the transcript scroller is wider than the scroller on the chat room and on every reading style, so the transcript scrolls sideways. No list row title or other shared recipe is named as the cause. The transcript is built in `packages/client/src/features/chat/components/transcript-window.tsx` and its rows in `packages/client/src/features/chat/components/message-content.tsx`.

## Why

A transcript that scrolls sideways has stopped reflowing, so a reader cannot follow the conversation.

## Done when

A component test in `tests/client/features/chat/components/` renders the transcript on each reading style at 390px wide and 300% text. It asserts that the scroller's scroll width equals its client width and names the widening element if it does not. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
