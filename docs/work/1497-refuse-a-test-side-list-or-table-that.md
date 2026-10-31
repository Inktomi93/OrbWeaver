---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Refuse a test-side list or table that restates a production union or registry

## What

orb/no-hand-copied-label catches copied labels in CT and e2e specs. Hand-listed rosters slip through: a test-side array or Record of string literals whose members are a production union's members, or a subset of them (the RPG config knobs, the host-gated verbs, the chat read verbs, the button glyph steps). Add an ESLint rule, or extend the existing one, over every test file: it reports a string-literal array or object-key set that matches members of an exported production union, tuple or registry, and names the production home to derive from.

## Why

A hand-listed roster passes review and still lets a new member go untested; only a mechanical check stops the next copy.

## Done when

The rule refuses a planted roster that restates a production tuple and accepts one derived from it; it runs over tests/; its findings across the whole tree are fixed or derived, so it reports zero.

## Evidence

Filled at landing: what ran and where its output is.
