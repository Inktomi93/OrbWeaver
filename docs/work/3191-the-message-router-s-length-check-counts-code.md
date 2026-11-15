---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: server
---

# The message router's length check counts code points while the builders count UTF-16 units

## What

`messageTextSchema` in `packages/server/src/transport/trpc/routers/chat.ts` is `z.string().max(MESSAGE_TEXT_MAX_CHARS)`, and zod 4 counts code points; the canon-write builders, the import check and the stream stop count `String.length` (UTF-16 units). The router therefore admits up to twice the cap in astral text, and its comment says the two agree.

## Why

Nothing bypasses the cap (the builder refuses later, and the 1 MiB request body is far below the cap), but the comment is wrong and the door and the builder disagree on the unit.

## Done when

The router schema uses `.refine((s) => s.length <= MESSAGE_TEXT_MAX_CHARS)` with the contract's error, or the comment states that the builder is the boundary; a contract case sends astral text across both measures.

## Evidence

Filled at landing: what ran and where its output is.
