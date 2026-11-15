---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The transcript's first read leaves alone, so a slow sibling never holds it

## What

The room's transcript reads its first page with useSuspenseQuery on chat.listMessages in packages/client/src/features/chat/components/transcript-window\.tsx (the tail read and LatestPageFallback). With the roster already cached, the composer mounts in the same commit and sends chat.checkSendAvailability (probes the chat engine's endpoint) and the next-turn line's connection.resolveChatCapability (warms the endpoint's facts) in the same tick, so one batch response waits for the slowest of them. Tag the transcript's first read through a typed options helper beside roomRosterOptions in packages/client/src/data/trpc.ts, exported through #data, and read it at both call sites; the observer in use-room-read.ts never fetches and needs no tag.

## Why

A batch is answered after its slowest call, so an endpoint that is asleep or down holds the transcript behind a probe whose timeout it does not need. The room roster already rides alone for the same reason; the transcript is the other read the room paints from.

## Done when

The transcript's first read carries the unbatched context through one options helper; a dom test sends it beside a held slow read through createTrpcClient and sees it settle first on its own request, and removing the tag turns it red.

## Evidence

Filled at landing: what ran and where its output is.
