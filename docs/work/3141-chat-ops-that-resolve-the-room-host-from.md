---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: typed-enforcers
---

# Chat ops that resolve the room host from a chat id take the consenting host instead

## What

createChatMemorySearchOps (packages/server/src/domain/chat/verbs/memory-search.ts), createMemoryEmbeddingOps and createChatRoomInputs resolve the room host inside compose from the chat id through loadPresentHostUserId (packages/server/src/entry/compose/chat.ts), which reads presence only and never the enabled axis. Change each op to take the ConsentingHostId its caller already holds (the turn, the preview, the selection bake and the sweep all read hostConsentOf first), and delete the chat-keyed resolver.

## Why

The ConsentingHostId brand closes every op that names its host as a parameter. These ops look the host up themselves, so the compiler cannot refuse a future caller that skips the consent read, and the query embed and vector writes they drive spend the host's embed connection.

## Done when

No chat op resolves the room host from a chat id; the digest search, memory embed store and room inputs each take ConsentingHostId; the type test in tests/server/domain/chat/substrate/participants-humans.test-d.ts names one of them as a refused raw-UserId door.

## Evidence

Filled at landing: what ran and where its output is.
