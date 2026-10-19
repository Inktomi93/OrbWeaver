---
kind: decision
status: open
updated: 2026-10-19
priority: P3
area: tests
plan: test-mirror
---

# Rule how e2e reaches the first-run persona ask

## What

The persona seeder auto-creates a default persona whenever E2E_HARNESS is on, by the ruling in the domain/persona/seeder/default.ts header, so the first-run persona ask for a joiner with no persona is unreachable on an automation stack.

## Why

The joiner-with-no-persona case can only leave CT if an e2e stack can run with the auto-seed off.

## Done when

Either a deliberate e2e mode runs with the auto-seed off and the case moves, or the ruling records the case as CT-only.

## Evidence

Filled at landing: what ran and where its output is.
