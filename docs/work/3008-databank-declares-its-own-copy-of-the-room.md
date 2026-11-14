---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: databank
---

# Databank declares its own copy of the room-host resolver type

## What

The databank contract declares a private type for the op that resolves a room's present host, the same shape the chat contracts now export for the regex and world-info rack reads.

## Why

One home per concept: a second declaration of the same op type can drift from the chat-owned one.

## Done when

The databank contract imports the host resolver type from the chat contracts and declares none of its own; typecheck and dependency-cruiser pass.

## Evidence

Filled at landing: what ran and where its output is.
