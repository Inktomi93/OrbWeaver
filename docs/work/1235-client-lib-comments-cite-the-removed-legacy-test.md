---
kind: tooling
status: open
updated: 2026-10-23
priority: P3
area: client
---

# Client lib comments cite the removed legacy test tree

## What

Comments in `packages/client/src/lib/prompt-macros.ts`, `motion-flaggers.ts`, `connection-roles.ts`, `collection-contracts.ts` and `bus-devlog.ts` cite files under a legacy test tree that no longer exists.

## Why

A comment that points at a missing file sends the next reader nowhere; the comment rule bans history and dead citations.

## Done when

Each citation points at a maintained test by its current path or is deleted; a search for the old tree name under packages prints nothing.

## Evidence

Filled at landing: what ran and where its output is.
