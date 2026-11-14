---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: persona
---

# Persona delete writes its seed plan outside the delete's batch

## What

`packages/server/src/domain/persona/verbs/remove.ts` reads the seed plan before the delete and writes it after the commit. Write the seeds from current values at write time, or put the seeds write in the delete's batch.

## Why

A concurrent last-played write can leave `seeds.currentPersonaId` pointing at the deleted persona, and a crown move between the plan and the write is overwritten.

## Done when

A test races `remove` against a seeds patch, and both seed pointers end on personas the owner still holds.

## Evidence

Filled at landing: what ran and where its output is.
