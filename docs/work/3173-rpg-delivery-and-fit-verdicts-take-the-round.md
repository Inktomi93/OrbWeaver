---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# RPG delivery and fit verdicts take the round's signal

## What

resolveFunderChat in packages/server/src/domain/rpg/tools/rounds/round-connection.ts resolves the funder's chat connection under a created signal, because the delivery and fit verdicts that call it take no signal.

## Why

A cancelled round keeps waking the funder's chat model for its verdicts.

## Done when

The verdict ops take a required signal and the round threads its turn or request signal into the resolve.

## Evidence

Filled at landing: what ran and where its output is.
