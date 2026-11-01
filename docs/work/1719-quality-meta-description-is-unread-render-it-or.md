---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: unwired-code
---

# QUALITY_META.description is unread: render it or delete it

## What

Delete `QUALITY_META.description`; the table keeps only the labels the dial uses.

## Why

The deck already shows one server-resolved gloss line under the Quality select (`qualityDeckGloss`), and a select renders labels only. A second description line would duplicate it.

## Done when

`QUALITY_META` in `packages/client/src/features/preset/lib/capability-panel-model.ts` has no `description` key.

## Evidence

Targeted typecheck, lint, depcruise and knip results are in the landing commit message.
