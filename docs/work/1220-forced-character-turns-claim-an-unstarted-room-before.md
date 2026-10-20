---
kind: bug
status: open
updated: 2026-10-20
priority: P2
area: server
plan: test-foundation
---

# Forced character turns claim an unstarted room before generation

## What

The public forceCharacterTurn path does not call claimChat before generation. A newly created unstarted room reaches generation but retained accounting refuses its unclaimed scope. The shared auxiliary-turn path claims before engine work.

## Why

A host-forced first reply can abort instead of starting the room.

## Done when

A real-root case forces a character on an unstarted owned room, completes canon and accounting, and proves the room is claimed before writes. Preserve host and roster authorization.

## Evidence

Filled at landing: what ran and where its output is.
