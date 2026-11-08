---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: server
---

# Persona reads that order by creation time break ties by id

## What

packages/server/src/domain/persona/persistence/queries.ts still sorts several persona reads by createdAt alone, while the list and the delete successor use NEWEST_PERSONA_FIRST with an id tie-break. Use the shared order wherever an order is visible.

## Why

Two personas created in the same millisecond come back in an unstable order, so a visible list can shuffle between reads.

## Done when

Every persona read that returns an ordered list uses NEWEST_PERSONA_FIRST or states why its order differs, with a tie test on one of them.

## Evidence

Filled at landing: what ran and where its output is.
