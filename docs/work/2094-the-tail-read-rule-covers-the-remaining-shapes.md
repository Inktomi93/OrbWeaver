---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a0d8661637829aec9
plan: test-foundation
---

# The tail-read rule covers the remaining shapes

## What

The rule that brackets tail reads misses x.at(x.length - 1), a bracketed requests key, aliases, a spread then pop, and recorders under other names such as funders in funded-tenant-rows.

## Why

A missed tail read can read yesterday's row as today's.

## Done when

Each shape is refused or proven safe at its live sites, and the rule stays on at zero.

## Evidence

Filled at landing: what ran and where its output is.
