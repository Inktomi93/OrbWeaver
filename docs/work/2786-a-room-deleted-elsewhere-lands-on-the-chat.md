---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# A room deleted elsewhere lands on the chat list without the retry wait

## What

When the active room's read answers not found, the client lands on the chat list, but only after the default query policy has retried the read twice, so the user watches a skeleton for a few seconds first.

## Why

Not found for a room is a final answer; retrying it only delays the landing.

## Done when

A not-found answer for the active room's read is not retried, the list shows at once, and the existing component test asserts no retry was sent.

## Evidence

Filled at landing: what ran and where its output is.
