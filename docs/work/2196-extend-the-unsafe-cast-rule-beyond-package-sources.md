---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: test-enforcement
---

# Extend the unsafe cast rule beyond package sources

## What

noUnsafeCastRule covers only packages/\*/src, not tooling or tests.

## Why

Unsafe casts in tooling and tests pass the gate.

## Done when

The rule covers tooling/src and tests with live sites fixed, or a cited law line scopes it to packages.

## Evidence

Filled at landing: what ran and where its output is.
