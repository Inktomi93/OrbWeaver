---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Tests read the databank upload route from its contract

## What

Three test sites spell the databank upload route by hand: tests/server/entry/http/\_body-limit-inputs.ts and both csrf-gates e2e specs.

## Why

A hand-spelled route drifts from DATABANK_UPLOAD_ROUTE.

## Done when

Each reads DATABANK_UPLOAD_ROUTE.

## Evidence

Filled at landing: what ran and where its output is.
