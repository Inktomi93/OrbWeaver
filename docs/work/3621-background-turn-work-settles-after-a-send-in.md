---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: test-foundation
---

# Background turn work settles after a send in a long room

## What

In a corpus test root, settleBackground after services.chat.send runs past two minutes when the room already holds fifty committed user messages, while the send itself returns in tens of milliseconds. The background work after the turn, likely the memory pass, either hangs in the product or waits on a testkit plan that never answers.

## Why

A product hang in post-turn work would stall memory for long rooms, and until it is found no test can seed a long room and settle.

## Done when

The cause is found and named as product or testkit; settle returns after such a send; a test seeds fifty rows, sends and settles.

## Evidence

Filled at landing: what ran and where its output is.
