---
kind: work
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# Ambient calls read code through one floor reader

## What

The test-foundation engine table names ambient calls as a shared reader with no item: no-raw-clock, no-raw-random, test-determinism, platform-spellings and sole-env-reader each recognise clock, random, timer and environment calls separately.

## Why

One home per concept; a spelling one gate catches and another misses is a gap.

## Done when

One floor reader recognises ambient calls for every consumer, or a native rule replaces a gate under D321; replaced readers are deleted; a per-case version table records changed findings.

## Evidence

Filled at landing: what ran and where its output is.
