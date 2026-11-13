---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# A send while the room read has failed shows its message

## What

When the room read has failed the room draws its composer over the failure plate. A send reaches the server, but the message stays hidden behind the plate until Retry.

## Why

The sender sees nothing happen and may send again.

## Done when

A send in the failed state either shows its result or is refused with a reason at the composer, with a component test for the chosen behaviour.

## Evidence

Filled at landing: what ran and where its output is.
