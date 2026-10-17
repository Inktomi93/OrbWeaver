---
kind: tooling
status: open
updated: 2026-10-17
priority: P2
area: tooling
plan: test-foundation
---

# Placement gates exclude server factory shapes

## What

Apply D324 in `no-inline-package-interface` and its native successor: a shape that is a parameter, return type or member of a function declared in the same file, in server entry, transport, infra or foundation, is not a finding. A plain-data shape with a wire-vocabulary name stays judged. Delete the baselined `@orb-waive no-inline-package-interface` markers the exclusion covers; adjudicate each remaining marker against the wire home.

## Why

The type-home table had no row for these shapes, so the gate stamped correct code with waivers that cite no item.

## Done when

The population exclusion has a planted positive and negative control, the covered markers are gone, and every remaining marker names a live reason or its shape has moved to the wire home.

## Evidence

Filled at landing: what ran and where its output is.
