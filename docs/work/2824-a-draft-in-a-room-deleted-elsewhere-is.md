---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: client
lane: wt/agent-a9a004f98f3d7c671
plan: cross-surface-consistency
---

# A draft in a room deleted elsewhere is not lost silently

## What

When an open room is deleted elsewhere while its reader is typing, the reader lands on the chat list. The typed draft stays in the draft store under a room that no longer exists, nothing is sent, and nothing tells the reader.

## Why

Typed text disappears from view with no explanation.

## Done when

Leaving a gone room with a non-empty draft tells the reader the chat was deleted and what became of the draft, and the draft store holds no entry for a room that is gone, with a component test.

## Evidence

Filled at landing: what ran and where its output is.
