---
kind: work
status: open
updated: 2026-11-24
priority: P3
area: tests
plan: test-foundation
---

# Test id helpers mint branded ids

## What

Ten brand-flow type rows under tests/ stay plain string because their producer is a test helper that returns a plain-string id (listed in the cb-brands lane report for 3913).

## Why

A helper that hands tests a plain string lets a test pass an id the product's own types would refuse, so a wrong-family id goes unseen in tests.

## Done when

Each helper returns the brand its product counterpart holds, minted through the kit's id module, the ten rows clear in brand-flow, and the touched suites pass.

## Evidence

Filled at landing: what ran and where its output is.
