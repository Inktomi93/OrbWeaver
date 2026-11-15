---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
---

# Say why a send, edit or reply was refused as too long

## What

A send, edit or turn refused with `message_too_long` or `message_macro_budget` shows only the generic failure toast (the send fallback, or "Couldn't save that edit."). The client can key on `data.reason` and the refusal's `data.detail` (field, chars, limit) through `packages/client/src/lib/turn-abort-notice.ts` and the edit mutation in `packages/client/src/features/chat/hooks/use-message-mutations.ts`.

## Why

The refusal is total and actionable (shorten the text or the script that grew it), but today it reads like a server fault.

## Done when

A refused send, swipe, continue and edit each show copy naming the length limit, from a zero-import copy module, with a CT per surface.

## Evidence

Filled at landing: what ran and where its output is.
