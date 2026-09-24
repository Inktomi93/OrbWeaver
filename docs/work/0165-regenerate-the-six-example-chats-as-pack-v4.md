---
kind: work
status: open
updated: 2026-09-24
priority: P1
area: chat
---

# Regenerate the six example chats as pack v4

## What

Regenerate every transcript in packages/default-content/demo-chats/ through the real path: start the chat, send, then export through the export verb. Use the owner's live-model connection policy. Bump the pack version so the seeding heal step fills existing libraries. Never edit a transcript by hand.

## Why

The shipped pack v3 transcripts predate the people block, section placement (ADR 0251), keyword world-info anchors, the bare fold and the RPG reminder frame. They are the first chats a new user opens.

## Done when

Six new transcripts ship as pack v4, tests/server/entry/boot/seed-demo-chats.int.test.ts passes, and a side-eye review covers the example chats as a first-run surface.

## Evidence

Filled at landing: what ran and where its output is.
