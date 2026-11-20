---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: tests
---

# The sampler coverage guard asserts each provider's exact sampler set

## What

tests/inference/conformance/sampler-coverage.suite.int.test.ts asserts that each built-in provider's samplers are non-empty, not which knobs they are. A provider row that loses top_k or gains a knob its server does not take stays green.

## Why

The guard catches a provider with no samplers but not one with the wrong ones.

## Done when

Each provider-row and family case asserts the exact knob set its source states, imported from that source, and a planted dropped knob goes red.

## Evidence

Filled at landing: what ran and where its output is.
