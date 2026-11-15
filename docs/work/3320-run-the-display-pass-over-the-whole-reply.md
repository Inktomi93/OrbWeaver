---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# Run the display pass over the whole reply in the trains layout, then split the drawn text into bubbles

## What

`trainParagraphsFor` (`packages/client/src/features/chat/components/message-row-parts.tsx`) splits the raw `message.content` into paragraphs through `splitIntoTrainParagraphs` (`packages/client/src/features/chat/lib/split-paragraphs.ts`), and each paragraph renders through its own `MessageContent`, so the display pass runs once per paragraph. Run it once over the whole reply and split what it draws. The split also cuts a `<style>` or `<script>` element the model wrote when its body holds a blank line; the split must skip a break inside a raw-text element, using the shared kit reader `rawTextElements`.

## Why

A display script whose match spans a blank line, as a status panel's does, never matches in the trains layout, because no single paragraph holds the whole match. This is the symptom from the imported preset report, on one chat style. It predates the regex branch.

## Done when

In the trains layout, a display script that matches across a blank line draws, and a CT on the trains row shows the drawn panel. A style element holding a blank line stays in one bubble and none of its text prints as prose. A Markdown code block holding blank lines stays in one bubble.

## Evidence

Filled at landing: what ran and where its output is.
