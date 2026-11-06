---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: type-law
---

# Status chips take one tone and label from a typed verdict or status union, so no raw wire word or local tone map reaches a chip

## What

Make a status chip take its tone and label from a typed verdict or status union, so a raw wire word or a local tone map cannot reach a chip.

## Why

packages/client/src/features/refinery/lib/verdict.ts keys its tone and word maps by plain strings and falls back to neutral or the raw spelling. A new member or a stray wire word reaches a chip with no compile error.

## Done when

The verdict and status maps are keyed by a tuple-backed union and checked for totality. Adding a member without a tone and a word fails the typecheck, and no chip receives a bare string.

## Evidence

Filled at landing: what ran and where its output is.
