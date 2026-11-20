---
kind: bug
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-a9a68adbff0236b8e
plan: chat-html-and-presets
---

# A narrator row from before a host handoff frames at the floor while its row renders at the room's policy

## What

A narrator row written before a host handoff carries the earlier host's synthetic group character. The client keys on the row's kind and renders it at the room's narrator policy. The card frame route in `packages/server/src/entry/http/card-frame.ts` recognises only the present host's group character, so the frame mints at the floor. A narrator row whose character id is null behaves the same.

## Why

The two sides disagree. The frame is the narrower one, so nothing opens that should not, but a card on such a row draws without its inline images or scripts.

## Done when

A ruling says whether past narrator rows follow the present room rule or floor on both sides, the row and the frame agree, and a test covers the handoff case.

## Evidence

Filled at landing: what ran and where its output is.
