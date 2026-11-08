---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# StageBandView\.liveHolders is required

## What

StageBandView\.liveHolders in the snap stage contract is optional, and five sites read it with an empty-list fallback, so the type does not catch a dropped field.

## Why

An optional field read with a fallback hides a producer that forgot to fill it.

## Done when

The field is required, the fallbacks go, and every producer fills it.

## Evidence

Filled at landing: what ran and where its output is.
