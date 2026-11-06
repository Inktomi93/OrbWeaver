---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# Two queued sends lose the dice note on the stamped reply (needs pending_turns.message_id)

## What

Add a message_id column to pending_turns in a numbered migration, and attach each queued send's dice note to the reply stamped for that send.

## Why

A pending turn records no message id, so the stamped reply cannot find the dice note of its own send.

## Done when

A test queues two sends with dice notes and both stamped replies carry their own note. The migration is numbered and the baseline is not regenerated.

## Evidence

Filled at landing: what ran and where its output is.
