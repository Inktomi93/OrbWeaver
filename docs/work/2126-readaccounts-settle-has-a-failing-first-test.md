---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a081e2b19fc567c08
plan: test-foundation
---

# readAccounts' settle has a failing-first test

## What

The settle that lane A added before readAccounts reads the user seed has no test of its own that fails without it.

## Why

Without its own red case, a later change can drop the settle and only an unrelated suite notices, under load.

## Done when

A test fails deterministically with the settle removed and passes with it.

## Evidence

Filled at landing: what ran and where its output is.
