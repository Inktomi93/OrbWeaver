---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: imagery
lane: wt/agent-a86bf753f37b76f6b
---

# Shared-room art variants honour the co-participant rule

## What

The blob variant route (?w=, packages/server/src/entry/http/blob.ts:155 into resolveVariant) keys the CAS read on the requesting user (resolve-variant.ts:123) and never consults the roster-avatar co-participant exception, which lives only in getMetadata (domain/assets/verbs/get-metadata.ts:23-30) on the original-blob route. In a shared room, another user's character echo art, ripple portrait and whisper banner (all ?w= requests) 404 for the other members.

## Why

Room members cannot see each other's character art in the art chat styles.

## Done when

The variant route resolves the owner through the same co-participant check as getMetadata, keys the variant cache on that owner, and denies non-participants exactly as the original route does; an int test seats a second user and requests ?w= on the first user's rostered avatar (served) and an unrelated user's (refused).

## Evidence

Filled at landing: what ran and where its output is.
