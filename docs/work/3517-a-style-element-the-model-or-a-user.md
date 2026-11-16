---
kind: bug
status: open
updated: 2026-11-16
priority: P1
area: chat
---

# A style element the model or a user wrote prints its CSS as message text on a row no display script styled

## What

`packages/client/src/features/chat/components/message-content.tsx` strips style elements from a plain row only when a display script's markup styled the row. A style element written by the model or a user on any other row goes to the sanitizer, which drops the tag and keeps its text, so the CSS prints as prose. It happens in every chat style, for model and user messages, on settled rows and on the forming row in `packages/client/src/features/chat/components/ghost-message-row.tsx`.

## Why

A stylesheet shown as message text is the defect the outside user's report is about, and a model writes a style element unasked.

## Done when

On every path where the frame does not draw the reply, a real style or script element in a prose block adds no text to the row, read by the same reader the frame lift uses. A style element inside a card block keeps its place in the card. A style element written as a code sample still shows as code. A kit test and a component test through the real row, for a model and a user message, settled and forming, fail first.

## Evidence

Filled at landing: what ran and where its output is.
