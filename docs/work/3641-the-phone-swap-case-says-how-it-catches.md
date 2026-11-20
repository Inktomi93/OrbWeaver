---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: tests
plan: test-foundation
---

# The phone swap case says how it catches a duplicate capture name

## What

The narrowed count in tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx catches a duplicate sheet capture name only through the refused transition, and nothing in the case asserts or states that.

## Why

A later edit can drop the refused check and leave the case unable to fail on a duplicate.

## Done when

The case asserts the transition was not refused, and a planted duplicate name turns it red on that assertion.

## Evidence

Filled at landing: what ran and where its output is.
