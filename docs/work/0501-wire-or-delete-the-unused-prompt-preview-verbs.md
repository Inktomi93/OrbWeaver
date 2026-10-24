---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: chat
---

# Wire or delete the unused prompt preview verbs

## What

ChatService.peekPrompt and previewSection have no router or product caller; `packages/server/src/transport/trpc/routers/chat.ts:267` says they stay unexposed on purpose. Only `tests/server/domain/chat/assembly/section-render-prng.int.test.ts` (lines 70 and 103) calls them.

## Why

Unwired code is a question about intent.

## Done when

Wire each verb to a router procedure or product caller, or delete it and its test use with a reason.

## Evidence

Filled at landing: what ran and where its output is.
