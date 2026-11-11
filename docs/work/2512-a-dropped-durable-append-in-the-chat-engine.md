---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: chat
---

# A dropped durable append in the chat engine resolves as success

## What

packages/server/src/domain/chat/engine/engine.ts has a path where a durable append that is dropped still resolves, so the engine cannot see the loss and carries on as if the row were written. The comment there pointed at an open design fork on how the failure should propagate; the fork has no item or decision record. Reproduce first: name the input or fault that drops the append and what the user sees afterwards.

## Why

A turn the engine believes it stored and did not is silent data loss in the transcript, the one thing chat persistence exists to prevent.

## Done when

The drop is reproduced in a test through the composed root with the storage edge scripted to fail, and the append's failure reaches the engine as a rejection it handles: the turn fails visibly or retries, by a recorded decision. If the path proves unreachable, it is closed with a type and the dead handling deleted.

## Evidence

Filled at landing: what ran and where its output is.
