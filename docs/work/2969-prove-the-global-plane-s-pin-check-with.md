---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# Prove the global plane's pin check with its own case

## What

Removing the pin condition in `stageTurnGlobalVariables` (`packages/server/src/domain/chat/verbs/turn.ts`) leaves every global-variable case green, because every pin case also flags the room.

## Why

The pin check is the only control for a room whose flag is false while its pin belongs to another account, such as a fork made before the flag whose shared parent was deleted. Nothing fails if it goes.

## Done when

A case seeds a never-shared room pinned to another account's persona through a sanctioned historic-state home and shows the plane held. If no such state is reachable, the condition is deleted with that proof.

## Evidence

Filled at landing: what ran and where its output is.
