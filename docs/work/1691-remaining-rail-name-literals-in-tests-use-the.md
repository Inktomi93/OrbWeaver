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

Replace the rail-name string literals that remain in tests with the section label each feature exports from its section-label module.

## Why

A test that spells a rail name as a literal keeps passing when the product label changes, so it no longer checks the rail the user sees.

## Done when

No test under tests spells a rail section name as a string literal. Each reads it from the feature's section-label module, and the suites that held the literals pass.

## Evidence

Filled at landing: what ran and where its output is.
