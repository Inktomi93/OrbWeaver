---
kind: tooling
status: open
updated: 2026-10-19
priority: P2
area: tooling
plan: test-foundation
---

# Zod shape placement includes strictObject and looseObject

## What

The shared shape-factory set has only object, enum and discriminatedUnion, while zod-modern-spellings steers authors to strictObject. An exported strictObject or looseObject schema escapes every placement owner.

## Why

The preferred spelling is the one the placement check misses.

## Done when

The factory set includes both spellings, tests/legacy/ui/art/web-weave/web-weave-glow-probe.ts:3 moves to its home, and its CT passes.

## Evidence

Filled at landing: what ran and where its output is.
