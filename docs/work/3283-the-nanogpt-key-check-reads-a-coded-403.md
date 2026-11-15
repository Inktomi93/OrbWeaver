---
kind: bug
status: doing
updated: 2026-11-15
priority: P3
area: connection
lane: wt/agent-aaaef4a406560836a
---

# The NanoGPT key check reads a coded 403 the way a chat turn does

## What

A 403 whose error code says the key is invalid marks the key as bad during a chat turn, and reads as an unreachable server on the key check.

## Why

Two paths give different verdicts for the same structured answer. The live check route answers plain strings today, so this is consistency.

## Done when

The key check reads the same code set as the chat path, with a case; or a recorded decision that the check route never sends the code.

## Evidence

Filled at landing: what ran and where its output is.
