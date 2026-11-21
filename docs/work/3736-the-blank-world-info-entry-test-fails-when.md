---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: world-info
plan: test-foundation
---

# The blank world info entry test fails when the blank-entry guard is removed

## What

In tests/server/domain/chat/assembly/world-info-blank-entry.int.test.ts the first case passes with the blank-entry guard in context.ts removed, because nothing asserts the blank entries are absent from the wire.

## Why

A test that cannot fail proves nothing.

## Done when

The case asserts the blank entries are absent from the sent request and goes red with the guard removed.

## Evidence

Filled at landing: what ran and where its output is.
