---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# Report the Biome Db member blindness upstream

## What

A member typed Db by name stops Biome useDisposables from firing, which is why OwnedDb spells its member through closeDb's parameter type. Reduce it to a minimal case and report it to Biome.

## Why

The odd type spelling exists only to work around this rule gap, and a later Biome version could change it silently.

## Done when

The rule is fixed upstream and the spelling becomes Db, or the workaround is recorded as permanent with its reason.

## Evidence

Filled at landing: what ran and where its output is.
