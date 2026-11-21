---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: rpg
plan: typed-enforcers
---

# The RPG state-round reply is read through the schema its grammar is built from

## What

stateRoundPatchSchema (packages/contracts/src/rpg/structured-patch.ts) builds the reply schema, typed by PatchValueEntry, but only feeds the JSON grammar sent to the model. patchChangesToToolCalls reads the reply as unknown with a hand-written readEntry, a second spelling of the entry shape.

## Why

A reader that restates the grammar's shape by hand drifts from it, and nothing links the two.

## Done when

readEntry is a per-entry safeParse against the entry schema from the same builder, keeping the per-entry tolerance (a malformed entry still counts as unreadable and the rest apply); the hand shape is deleted; the structured-patch tests pass and a case with one malformed entry among good ones still applies the good ones.

## Evidence

Filled at landing: what ran and where its output is.
