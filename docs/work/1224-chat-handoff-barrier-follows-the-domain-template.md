---
kind: bug
status: open
updated: 2026-10-21
priority: P2
area: server
plan: test-foundation
---

# Chat handoff barrier follows the domain template

## What

`packages/server/src/domain/chat/handoff-barrier.ts` implements room-work coordination at the domain root, outside the domain template.

## Why

Room-work coordination needs a domain home that preserves the documented dependency direction.

## Done when

Move the implementation to its lawful domain home and update actual imports. Preserve handoff settlement through affected behavioral tests and native compiler checks.

## Evidence

The implementation remains at the domain root. File placement is not a reason to rebuild a custom layout checker.
