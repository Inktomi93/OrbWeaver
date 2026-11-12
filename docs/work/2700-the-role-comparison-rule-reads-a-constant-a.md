---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: security
plan: checked-law
---

# The role comparison rule reads a constant, a set, a lookup table and a renamed field

## What

The lint selector that refuses a role comparison outside the identity contracts catches equality, switch cases and array includes. It misses a comparison to an imported or named constant, a set membership test, a lookup table keyed by role, and a role held in a renamed field. Invariant six of `docs/law/Spine-Identity-and-Auth.md` leaves those to review.

## Why

Each missed shape is a second place that can decide what a role means with the rule still green.

## Done when

A type-aware rule refuses a comparison or keyed lookup whose operand has the role type, whatever the field or constant is named, with a planted control per shape, on at zero over server and client.

## Evidence

Filled at landing: what ran and where its output is.
