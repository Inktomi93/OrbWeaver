---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: server
---

# An aborted reply records no spend for the output the provider billed

## What

A generation leg is recorded only on a completed result (`packages/server/src/domain/chat/persistence/generation-observation.ts`). A reply the stream stop aborts at the text cap, like every other abort (user stop, disconnect), records no spend, although the provider billed every token it streamed.

## Why

Spend readouts under-report exactly the runaway turns that cost the most. This is the existing posture for every abort, not new in the cap.

## Done when

An aborted leg records the usage the stream reported up to the abort (or an estimate marked as such), with a composed-root case that aborts a scripted stream and reads the recorded spend.

## Evidence

Filled at landing: what ran and where its output is.
