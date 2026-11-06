---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: tests
plan: test-foundation
---

# Remaining rail-name literals in tests use the shell's section-label home

## What

Replace the rail-name string literals that remain in tests with the label constant each feature exports from its `*-section-label.ts` module under packages/client/src/features.

## Why

A test that spells a rail name as a literal keeps passing when the product label changes, so it no longer checks the rail the user sees.

## Done when

No test under tests spells a rail section name as a locator or assertion string. Each reads the label constant from the feature module, and the suites that held the literals pass. The same word used as plain prose or a different heading stays.

## Evidence

Filled at landing: what ran and where its output is.
