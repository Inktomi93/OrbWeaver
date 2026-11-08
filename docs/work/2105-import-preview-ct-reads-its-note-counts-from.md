---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Import preview CT reads its note counts from production

## What

notedCounts in import-preview\.ct.tsx copies the note logic of kindLine in import-preview-summary.tsx, and the fixture stages no note items.

## Why

A copied rule drifts from production and the test still passes.

## Done when

The test reads the production rule and the fixture stages note items.

## Evidence

Filled at landing: what ran and where its output is.
