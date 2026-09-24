---
kind: work
status: open
updated: 2026-09-24
priority: P1
area: chat
---

# Default preset places Memory, Databank and Guided below Chat History

## What

Move the Memory, Databank and Guided instruction markers below Chat History in the shipped default preset (packages/contracts/src/preset/index.ts near the chat-history pivot).

## Why

ADR 0251 says a preset that lists per-turn content above Chat History loses the history cache, and tells authors to list it below. The shipped default does the opposite.

## Done when

The default preset lists the three markers after Chat History, and a shape test shows they arrive as depth-0 tail content on system-row models and as a bare fold elsewhere.

## Evidence

Filled at landing: what ran and where its output is.
