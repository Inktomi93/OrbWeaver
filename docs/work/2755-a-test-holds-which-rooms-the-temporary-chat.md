---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: chat
plan: authorization-and-visibility
---

# A test holds which rooms the temporary-chat sweep chooses

## What

No server test checks which rooms the temporary-chat sweep selects. A change that reverses the expiry cutoff, or that takes a room the caller does not host, leaves every test passing.

## Why

An edit to the sweep could delete an unexpired room or another host's room unnoticed.

## Done when

A test through the production sweep shows an unexpired room and another host's room survive while an expired room of the caller's is deleted.

## Evidence

Filled at landing: what ran and where its output is.
