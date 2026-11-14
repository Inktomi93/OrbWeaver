---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# Rule on a host generate that answers a queued send the drain answers again

## What

While a member's send waits for the host, a host generate answers that send, and the later drain answers the same send again (`packages/server/src/domain/chat/verbs/turn.ts`). Both replies carry the send's own dice note, so no note is misattributed.

## Why

One send gets two replies. Whether a host generate should consume the queued turn is a product call.

## Done when

The owner rules whether a host generate consumes the waiting send, and the queue follows the ruling with a case through `chat.send`, `chat.generate` and the drain.

## Evidence

Filled at landing: what ran and where its output is.
