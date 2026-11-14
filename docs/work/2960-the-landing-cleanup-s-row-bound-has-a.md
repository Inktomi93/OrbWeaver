---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# The landing cleanup's row bound has a failing case when removed

## What

The cleanup of an unfinished landing in `packages/server/src/domain/chat/persistence/import-landing.ts` deletes in bounded chunks. No committed case fails when the bound is removed; a red needs a very large room.

## Why

A change that deletes the whole room in one statement would hold the event loop at boot, with every test passing.

## Done when

A case fails when the cleanup bound is removed, at a size the suite can afford, or the bound is injected so a small room can prove it.

## Evidence

Filled at landing: what ran and where its output is.
