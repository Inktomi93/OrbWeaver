---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: tests
plan: test-foundation
---

# The image-drop-notices CT drops its warning frames about one run in eight

## What

In tests/client/features/chat/components/image-drop-notices.ct.tsx the room renders but neither scripted warning frame raises a toast about one run in eight (expected 2 toasts, got 0). The frames likely reach the page before the room's warning subscription exists; 2108's fix did not close it.

## Why

It turns full CT runs red at random.

## Done when

The case waits on the room's warning subscription before the socket route sends frames, and passes 20 sequential runs alone.

## Evidence

Filled at landing: what ran and where its output is.
