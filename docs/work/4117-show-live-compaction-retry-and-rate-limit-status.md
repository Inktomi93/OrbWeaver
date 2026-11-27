---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: chat
---

# Show live compaction, retry and rate-limit status during a turn

## What

ChatRequestBase.onEvent carries compaction, retry and rate-limit events from every runner during a turn, but no production caller passes a handler, so the chat screen never shows a turn compacting, retrying or waiting on a rate limit while it runs.

## Why

Collected data the app never shows is a product item; a user watching a stalled turn cannot tell a retry or a rate-limit wait from a hang.

## Done when

The turn path passes an onEvent handler, the chat screen shows compaction, retry and rate-limit state live with a CT per state, or the item records the ruling that the status is unwanted and onEvent is deleted with its runner plumbing.

## Evidence

Filled at landing: what ran and where its output is.
