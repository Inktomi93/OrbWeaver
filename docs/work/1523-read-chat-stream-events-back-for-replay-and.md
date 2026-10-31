---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: unwired-code
---

# Read chat stream events back for replay and resume

## What

chat_stream_events is written every turn and read only by replayStreamEvents and streamEventBounds, which nothing calls. Wire the read side fully: find what the table was built for (reconnect resume, late-joiner catch-up, turn replay) from its writers, file headers and the ledger, and wire every consumer that law names, end to end from client reconnect to the replayed frames.

## Why

Owner ruling: wire the stream events properly and fully instead of dropping the table.

## Done when

A client that reconnects mid-turn or joins late receives the turn's events from the table; an integration test drives a real reconnect through the production room and asserts the replayed frames; no write-only column or table remains.

## Evidence

Filled at landing: what ran and where its output is.
