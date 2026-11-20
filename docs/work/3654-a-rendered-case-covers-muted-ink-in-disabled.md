---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# A rendered case covers muted ink in disabled controls on every seed

## What

D355 binds on muted ink over tints and fields in disabled controls, which only the token build checks. No component test mounts a disabled Select, ListRow caption or OptionStrip on each seed and a carried scope and reads the design audit.

## Why

A token build change that drops a seed below the inactive floor would pass every rendered test.

## Done when

A component test over each seed and a carried scope is red with the resting step planted and green on main.

## Evidence

Filled at landing: what ran and where its output is.
