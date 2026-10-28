---
kind: bug
status: open
updated: 2026-10-28
priority: P2
area: tooling
plan: surface-walk
---

# Preserve native CPU profile timing fields

## What

Preserve the native CDP profile timing fields in `tooling/src/snap/ops/arms/cpu-profile.ts`. Its projection keeps nodes and samples while dropping startTime, endTime and timeDeltas.

## Why

The artifact declares complete V8 sampling evidence and advertises profiler import, but omits the timing needed to interpret sample duration.

## Done when

Retain the complete supported native profile. Prove timing preservation through an actual captured profile and a maintained consumer. Keep sampling separate from rate measurements. Reject incomplete capture without claiming complete evidence.

## Evidence

Filled at landing: what ran and where its output is.
