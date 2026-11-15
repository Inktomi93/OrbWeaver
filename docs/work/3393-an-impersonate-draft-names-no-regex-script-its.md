---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# An impersonate draft names no regex script its passes did not apply

## What

`createImpersonateStream` in `packages/server/src/domain/chat/verbs/turn.ts` builds a turn base whose gather records into a regex notice episode, but `generateTextUnpersisted` in `packages/server/src/domain/chat/engine/engine.ts` is bus-silent and passes no episode to `runTurnPipeline`, so a host script skipped while drafting is named nowhere. Decide whether the draft reaches the host as the same host-only `regex_script_not_applied` warning (it writes no canon, so the durable log may be the wrong home) or as a field on the draft stream to a host requester only.

## Why

The owner ruled that a skipped script is never silent; 3086 covers every persisted leg but not the unpersisted draft.

## Done when

A host impersonate draft whose pass skips a host script tells the host which script and why, a member requester learns nothing about host scripts, and no durable event is written for a draft unless the ruling says so.

## Evidence

Filled at landing: what ran and where its output is.
