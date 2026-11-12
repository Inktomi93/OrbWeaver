---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# Every asset-bearing column is in the asset reference list

## What

A schema test that fails when a table holds an asset id with no asset reference row. The sites whose comments claimed the checker are listed under M8 in the missing-checker list under reports/law-census.

## Why

The comment claimed coverage that no test holds.

## Done when

The test fails on a planted asset column and the assets comment cites it.

## Evidence

Filled at landing: what ran and where its output is.
