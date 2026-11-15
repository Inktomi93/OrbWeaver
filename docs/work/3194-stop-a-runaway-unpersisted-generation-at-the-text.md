---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: server
---

# Stop a runaway unpersisted generation at the text cap

## What

`generateTextUnpersisted` in `packages/server/src/domain/chat/engine/engine.ts` (the impersonate draft that `packages/server/src/domain/chat/verbs/turn.ts` streams into the composer) has no stream stop. The persisting turn now aborts at `MESSAGE_TEXT_MAX_CHARS` through `packages/server/src/domain/chat/engine/stream-cap.ts`; the draft path does not, so a runaway model fills server memory and the subscription until its output-token limit. Confirmed by the security review of the cap.

## Why

Same defect class as the committed-reply runaway: model output with no character bound. The draft never reaches canon, so only memory and the wire are at stake.

## Done when

The draft path composes the same stream cap onto its signal and refuses with `message_too_long`, with a test whose provider streams past the cap.

## Evidence

Filled at landing: what ran and where its output is.
