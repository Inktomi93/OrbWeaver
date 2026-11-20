---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A streaming card drawn plain shows no notice until its row settles

## What

`packages/client/src/features/chat/components/ghost-message-row.tsx` passes no plain verdict to `CardBlock`, so a card drawn inert while its reply streams shows no plain-content notice and gains it when the row settles, which grows the card at commit.

## Why

The card changes height when the turn commits, and the reason is missing while the reply streams.

## Done when

The streaming row resolves its plain verdict through `resolveRowRenderPolicy` and its inert card shows the notice the settled row will. A component test asserts the notice on the streaming card.

## Evidence

Filled at landing: what ran and where its output is.
