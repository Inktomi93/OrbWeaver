---
kind: tooling
status: open
updated: 2026-10-18
priority: P3
area: tooling
plan: test-foundation
---

# test-hand-shape reads function value signatures

## What

After 966, a function value (arrow or callback) at a boundary production may own reads UNKNOWN because the shape-constituents walk does not read signatures; it is most of the gate's UNKNOWN volume on the sampled tests. Walk a function value's parameter and return types within the existing bounded walk.

## Why

Callbacks passed to production functions are common in tests; judging their signatures turns most remaining UNKNOWNs into real verdicts.

## Done when

Function values at production boundaries are judged through their parameter and return types, a hand inside a callback signature is a finding, and the gate's UNKNOWN share on the sample drops accordingly.

## Evidence

Filled at landing: what ran and where its output is.
