---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# The Characters context chats empty state stops repeating the hero's New chat

## What

The chats-with-character pane always shows New chat in its empty state while the character hero shows the same action, so both are on screen when the hero is visible. The pane cannot tell: hero visibility depends on the context pane's mode, which is computed only inside `packages/client/src/features/app-shell/hooks/use-shell-layout.ts`, and no feature may import app-shell. Publish a context-mode projection from client state through the one panel-mode algebra, beside `packages/client/src/state/section-list-projection.ts`, and thread it to the pane. A narrow-desktop overlay, where content sits inert behind the scrim, counts as hero not visible. The pane's comment that records the dual door as intended is amended with the change.

## Why

Two doors to one action on one screen split attention; the house rule is one control per action per screen.

## Done when

The pane shows New chat only when the hero's is not visible, read from a context-mode projection in client state, with a CT at desktop, narrow-desktop overlay and phone, and the duplicate finding is gone from the evidence case.

## Evidence

Filled at landing: what ran and where its output is.
