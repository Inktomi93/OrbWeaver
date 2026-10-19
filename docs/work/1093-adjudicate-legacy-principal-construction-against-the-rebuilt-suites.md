---
kind: decision
status: open
updated: 2026-10-19
priority: P3
area: tests
plan: test-foundation
---

# Adjudicate legacy Principal construction against the rebuilt suites

## What

The testkit principal factory resolves the stored role through the production row resolver and takes a harness root, while legacy support wrappers call it with role and handle overrides that no longer exist. About 4,581 legacy call sites and about 20 wrappers depend on that shape, and pure unit legacy files have no database to resolve against.

## Why

A scripted rewrite would change what override-based legacy cases prove and is the legacy retrofit the rebuild direction rules out; leaving them red loses that regression coverage.

## Done when

A ruling records, per legacy domain, whether its cases are rebuilt in the maintained suites or migrated to the resolver, and the ruled work is filed.

## Evidence

Filled at landing: what ran and where its output is.
