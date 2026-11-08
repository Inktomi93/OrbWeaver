---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: security
lane: wt/agent-a05d401fe0a7ad9c7
plan: test-foundation
---

# Make the plugin canon read take the whole visibility answer

## What

The bridge canon read's only membership gate is the null check on resolveViewerVisibility in packages/server/src/domain/plugin/substrate/bridge.ts. A change that writes visibility?.historyFloorSeq ?? NO_HISTORY_FLOOR compiles and leaks canon to a non-member; only the room-reads test catches it. The handoff case in the room-reads suite also asserts only ok: false, which a TypeError satisfies.

## Why

A membership gate a one-line default can bypass should be a type, not a convention (AGENTS.md: close an impossible case with a type).

## Done when

The canon persistence read takes the visibility answer (or a member-proof type) so a non-member path cannot compile, and the handoff case asserts its typed refusal. The room-reads suite stays green.

## Evidence

Filled at landing: what ran and where its output is.
