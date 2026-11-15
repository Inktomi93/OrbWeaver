---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# Run the display pass over the whole reply in the trains layout, then split the drawn text into bubbles

## What

`trainParagraphsFor` (`packages/client/src/features/chat/components/message-row-parts.tsx`) splits the raw `message.content` into paragraphs, and each paragraph renders through its own `MessageContent`, so the display pass runs once per paragraph. Run it once over the whole reply and split what it draws.

## Why

A display script whose match spans a blank line, as a status panel's does, never matches in the trains layout, because no single paragraph holds the whole match. This is the symptom from the imported preset report, on one chat style. It predates the regex branch.

## Done when

In the trains layout, a display script that matches across a blank line draws, and a CT on the trains row shows the drawn panel.

## Evidence

Filled at landing: what ran and where its output is.
