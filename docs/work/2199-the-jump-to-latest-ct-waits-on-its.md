---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a9d600876102df860
plan: test-foundation
---

# The jump-to-latest CT waits on its room the way 2108 fixed

## What

tests/client/features/chat/components/jump-to-latest.ct.tsx still waits with awaitAttaches 1 on a chat-room frame, the race that made the image-drop CT flake before 2108.

## Why

A CT that waits on the wrong signal flakes under load and reads as a product red.

## Done when

The case waits on the room's own ready signal, and it passes repeatedly under throttle where the old wait failed.

## Evidence

Filled at landing: what ran and where its output is.
