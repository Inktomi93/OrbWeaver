---
kind: bug
status: open
updated: 2026-09-23
priority: P2
area: tooling
---

# Fix the snap appearance tests that route to an unknown section

## What

tests/tooling/\_shared/appearance.int.test.ts drives the route /no-settings, which snap now refuses as an unknown section (since 381254131).

## Why

A stale fixture keeps the tooling battery red.

## Done when

The tests use a valid --goto target and pass; a test still covers the unknown-section refusal.

## Evidence

Filled at landing: what ran and where its output is.
