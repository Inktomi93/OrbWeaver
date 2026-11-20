---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A commit with no turn id during a stream is taken as the live turn's own row

## What

`markCommitted` in `packages/client/src/state/chat-stream.ts` accepts a `messageCommitted` with no `turnId` as the live turn's row. An edit, image or narrator commit during a turn can yield the ghost mid-stream, and the hand-over hold is then released against the wrong row.

## Why

The streaming reply can vanish until its real commit lands.

## Done when

Only a commit that carries the live turn's id sets `committedMessageId`, and a test commits an edit during a stream and asserts the ghost stays.

## Evidence

Filled at landing: what ran and where its output is.
