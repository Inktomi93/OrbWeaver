---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The blob owner read's comment states the timing it gives

## What

The comment above the link read in `packages/server/src/domain/chat/verbs/load-co-participant-owner.ts` says the door answers every case in the same time. The door answers "nobody holds these bytes" and "someone outside my rooms holds them" in the same time. A holder inside the caller's own room with no reference answers slightly later, because the link query then looks up one asset id.

## Why

A comment that overstates a security property leads the next change to rely on it.

## Done when

The comment states which answers are indistinguishable by time and which are not.

## Evidence

Filled at landing: what ran and where its output is.
