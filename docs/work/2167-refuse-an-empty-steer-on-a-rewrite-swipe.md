---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: chat
---

# Refuse an empty steer on a rewrite swipe at the server

## What

A rewrite swipe sent to the API with an empty steer builds a request that ends on the target reply with no instruction after it. The client blocks this in use-guided-actions.ts; the server path in turn.ts createSwipe does not.

## Why

The model reads a trailing reply as a prefill and continues it instead of rewriting it.

## Done when

The swipe verb refuses a rewrite with an empty steer, with a red-first int case through the composed chat root.

## Evidence

Filled at landing: what ran and where its output is.
