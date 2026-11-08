---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-aa1f4dc846d1712b8
plan: test-foundation
---

# Give the bundle-body-limit staged-backup case a budget

## What

tests/server/entry/http/bundle-body-limit.int.test.ts runs close to the default test timeout alone and times out under load.

## Why

A shared box gives false reds, and a false red hides a real one.

## Done when

The case carries a reasoned timeout or the slow tag, and passes in a whole-suite run under load.

## Evidence

Filled at landing: what ran and where its output is.
