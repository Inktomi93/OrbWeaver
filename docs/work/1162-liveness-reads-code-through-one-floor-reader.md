---
kind: work
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# Liveness reads code through one floor reader

## What

The test-foundation engine table names liveness as a shared reader with no item: pnpm ast dead, orphans, testonly and chains, the ledger-paths suite and testid-liveness each read liveness separately.

## Why

One home per concept; the strict gates and pnpm ast must give one liveness answer.

## Done when

One floor liveness reader serves pnpm ast and the gates; replaced readers are deleted; a per-case version table records kept or changed findings.

## Evidence

Filled at landing: what ran and where its output is.
