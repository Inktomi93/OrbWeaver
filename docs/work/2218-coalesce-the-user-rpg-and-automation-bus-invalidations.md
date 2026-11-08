---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: client
---

# Coalesce the user, rpg and automation bus invalidations

## What

The user, rpg and automation buses refetch once per frame, like the chat bus.

## Why

A burst of frames starts one refetch per frame.

## Done when

A burst of user-bus frames refetches once, and direct callers and invalidation-initial-read.dom.test.ts keep their immediate effect.

## Evidence

Filled at landing: what ran and where its output is.
