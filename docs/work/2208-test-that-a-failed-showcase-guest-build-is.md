---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Test that a failed showcase guest build is retried

## What

The showcase-guest build now forgets a failed build like the template and schema caches, but no test plants a showcase failure.

## Why

A regression to caching the failure would pass unnoticed.

## Done when

A test plants one showcase build failure and sees the next root succeed.

## Evidence

Filled at landing: what ran and where its output is.
