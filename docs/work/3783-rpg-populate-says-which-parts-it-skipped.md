---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: rpg
plan: unwired-code
---

# RPG populate says which parts it skipped

## What

salvagePopulate in packages/server/src/domain/rpg/tools/rounds/populate.ts drops parts that do not conform and logs their names, and the populate verdict the client reads carries no dropped list, so the success toast says the card filled.

## Why

A host believes the whole card populated when quests or inventory were dropped.

## Done when

The populate verdict carries the dropped part names, the success toast lists them when any were dropped, and the populate suite covers a partly malformed reply.

## Evidence

Filled at landing: what ran and where its output is.
