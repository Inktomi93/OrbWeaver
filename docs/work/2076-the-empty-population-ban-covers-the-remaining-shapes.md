---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a0d8661637829aec9
plan: test-foundation
---

# The empty-population ban covers the remaining shapes

## What

The ban on checks that pass on nothing misses requests.at(requests.length - 1), a destructured requests.at(-1), expect.soft over an every call, a chain on the right of a nullish fallback, and expect over a some call compared to false, which has live sites in many test files.

## Why

Each missed shape is a check that can pass on an empty population.

## Done when

Each shape is refused by the rule or proven safe at its sites, live sites migrate by codemod, and the rule stays on at zero.

## Evidence

Filled at landing: what ran and where its output is.
