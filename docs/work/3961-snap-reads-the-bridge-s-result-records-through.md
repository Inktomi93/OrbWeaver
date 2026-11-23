---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# Snap reads the bridge's result records through the declared types

## What

tooling/src/unwired/deliberate.ts keeps AGENT_RESULT rows for the bridge's result records (motion, theme fallback, CSS merge, plugin log and UI, appearance matrix, query and shell snapshots, nav capabilities, RPG and ring metadata). Snap's evaluate closures return these types, but each result goes into a shape validator that takes unknown, so no member read resolves to the declaration. tooling/src/ui-audit/contract/types.ts also restates ShellSnapshot by hand, on the stale premise that tooling has no @orb/client dependency; since 3788 it can import the type.

## Why

A renamed or removed result member fails only at run time, the member scan cannot tell a read member from a dead one, and the hand-restated validators let the client and snap drift.

## Done when

Each listed home has a typed reader in tooling/src/snap or tooling/src/floor, its AGENT_RESULT row is gone, the member scan lists none of their members, and renaming a member fails the tooling typecheck. A validator that must stay unknown because its input is user data keeps its row with that reason.

## Evidence

Filled at landing: what ran and where its output is.
