---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: typed-enforcers
---

# Memory digest search resolves its host's encoder with a raw host id

## What

`searchDigests` in `packages/server/src/domain/chat/verbs/memory-search.ts` takes the room host from `deps.resolveHostUserId`, which compose binds to `loadPresentHostUserId` (`packages/server/src/entry/compose/chat.ts`), a plain `UserId | null` with no consent read. It then embeds the recall query on that host's encoder through `deps.digests`. Its callers (the turn gather and the preview inputs) read `hostConsentOf` first, so no product door reaches a disabled host today, but nothing in the type says so.

## Why

A path that spends a host's account without the consent read has returned several times. This one is safe only because every caller remembers the read; a new caller that does not would embed on a disabled host's encoder and compile.

## Done when

The digest search obtains its host through the consent proof (`createLoadConsentingHostUserId` in `packages/server/src/domain/chat/verbs/load-consenting-host.ts`, or a `ConsentingHostId` threaded from the caller), the host parameter of the embed it runs takes `ConsentingHostId`, and `tests/server/domain/chat/substrate/participants-humans.test-d.ts` refuses a raw `UserId` there.

## Evidence

Filled at landing: what ran and where its output is.
