---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Extend the hand-copied label rule to label functions, error codes, routes and env keys

## What

orb/no-hand-copied-label indexes label-named constant exports only. Extend it, or add a sibling, to label-producing functions (contextToggleLabel), exported error code objects, route constants and env key constants, and record the convention that user-facing names live in zero-import .ts modules.

## Why

The audit's most frequent copy is a label or code that production exports under a shape the rule does not index.

## Done when

The rule refuses a planted copy of each kind and accepts the import; its findings over tests/ are fixed; the convention is in tests/support/README.md.

## Evidence

Filled at landing: what ran and where its output is.
