---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# A failed template build or schema generation is not cached for the rest of the worker

## What

tests/support/node/db.ts caches a failed template build or a failed schema generation, so every later root in that worker goes red with the first error.

## Why

One transient failure turns a whole worker's results red and hides which test really failed.

## Done when

A failed build is not cached, the next root retries it, and a test plants one failure and sees the next root succeed.

## Evidence

Filled at landing: what ran and where its output is.
