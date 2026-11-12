---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: chat
plan: authorization-and-visibility
---

# Chat and rpg strip decoded tool JSON through one function

## What

The member JSON text function in the chat contracts and its sibling in the rpg tool-call visibility module do the same decode, strip and re-encode separately. The chat copy carried a shortcut the rpg copy never had, and that shortcut leaked.

## Why

Two copies of a member-visibility strip drift.

## Done when

Both call one function and the existing tests of both pass.

## Evidence

Filled at landing: what ran and where its output is.
