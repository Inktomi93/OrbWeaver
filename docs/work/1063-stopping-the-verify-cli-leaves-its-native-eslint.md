---
kind: bug
status: doing
updated: 2026-10-18
priority: P2
area: tooling
lane: wt/agent-ad57b7b38ce74731d
plan: test-foundation
---

# Stopping the verify CLI leaves its native ESLint worker running

## What

tooling/src/verify/ops/eslint-profile.ts (around line 254) launches the native ESLint worker through a blocking spawn with no stop handling, the pattern 1055 removed from the inventory worker, so stopping the CLI orphans it.

## Why

A stopped lint run can keep a heavy worker alive on the shared host, as the inventory worker did.

## Done when

The ESLint worker launches through the supervised niced-exec path, with a test that stops the CLI mid-run and asserts no worker survives.

## Evidence

Filled at landing: what ran and where its output is.
