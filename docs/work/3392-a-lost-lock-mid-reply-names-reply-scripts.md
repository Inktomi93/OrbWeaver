---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A lost lock mid-reply names reply scripts for a reply never saved

## What

Run a stopped turn's receive pass in the engine after it decides what is kept, so a stale abort with streamed prose runs no reply or reasoning save script.

## Why

packages/server/src/domain/chat/engine/pipeline.ts receiveStopped runs the pass whenever the stopped loop holds prose; the pipeline does not know the abort reason, and a stale abort keeps nothing, so the host's ai_output notice says a saved reply went on without the script. Left open by the freeze-delta follow-up bf42fa2873.

## Done when

A stale-abort case with streamed prose in tests/server/transport/trpc/stream/regex-not-applied-host-warning.int.test.ts sends only the user_input notice, and the kept-Stop case still names each saved leg once.

## Evidence

Filled at landing: what ran and where its output is.
