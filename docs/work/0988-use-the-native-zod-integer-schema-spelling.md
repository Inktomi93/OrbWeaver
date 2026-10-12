---
kind: work
status: open
updated: 2026-10-12
priority: P2
plan: test-foundation
---

# Use the native Zod integer schema spelling

## What

Replace z.number().int() with z.int() where equivalent, preserving schema options, constraints and error behavior. Enable zod/no-number-schema-with-int in eslint.config.js and fix its full governed population.

## Why

The maintained ESLint plugin owns this syntax rule; disabled enforcement leaves the migration incomplete.

## Done when

The plugin rule is enabled without new suppressions, every governed site uses the native integer spelling, and affected schema behavior and type programs pass scoped checks.

## Evidence

Filled at landing: what ran and where its output is.
