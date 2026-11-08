---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
---

# Queue a delete carrier that beats a room's initial read

## What

invalidation-carrier.ts does not queue a delete carrier that arrives before a room's initial read, so the initial read's rows briefly show the deleted row until the follow-up refetch.

## Why

A reader sees a deleted message reappear for a moment.

## Done when

A delete carrier that beats the initial read is applied when the read lands, with a DOM test through the production providers.

## Evidence

Filled at landing: what ran and where its output is.
