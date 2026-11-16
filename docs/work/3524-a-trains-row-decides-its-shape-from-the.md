---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
---

# A trains row decides its shape from the stored reply, so a script that adds paragraphs still shows one bubble

## What

`packages/client/src/features/chat/components/message-row-parts.tsx` decides whether a row draws as a train from the stored text. The bubbles are cut from the drawn text. A display script that turns one stored paragraph into several leaves the row as one bubble. Found by reading.

## Why

The trains layout should follow what the reader sees.

## Done when

The row trains by the drawn text once it has landed, with no shape change on landing for a row whose paragraph count is the same, and a component test under `tests/client/features/chat/components/` covers a script that adds paragraphs.

## Evidence

Filled at landing: what ran and where its output is.
