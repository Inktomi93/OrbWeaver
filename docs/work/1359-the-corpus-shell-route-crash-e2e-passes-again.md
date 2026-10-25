---
kind: bug
status: open
updated: 2026-10-25
priority: P2
area: tests
plan: test-foundation
---

# The corpus-shell route-crash e2e passes again

## What

tests/e2e/corpus-shell.spec.ts:309 (a route render crash reports once) fails on main in every corpus cell: the planted chunk crash surfaces as a React invalid-element error instead of the planted message.

## Why

The crash fake likely no longer matches the authed-app chunk export shape after the polyfill entry moved the app graph behind entry.ts.

## Done when

The case passes on the corpus cells and its fake derives the chunk shape from production.

## Evidence

Filled at landing: what ran and where its output is.
