---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# The preset blob version matches the column default

## What

A migration test that fails when the preset blob version and the `presets.schema_version` default differ. The sites whose comments claimed the checker are listed under M9 in the missing-checker list under reports/law-census.

## Why

The comment claimed a script that does not exist.

## Done when

The test fails on a planted version bump with no migration, and the comment cites it.

## Evidence

Filled at landing: what ran and where its output is.
