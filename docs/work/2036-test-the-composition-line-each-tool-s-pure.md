---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tooling
plan: test-foundation
---

# Test the composition line each tool's pure helper depends on

## What

Fix the rows below, keeping each change to a small named function. Group LB7 in the ledger triage, reports/codex-test-audit/ledger-triage.md, holds the rows, causes and the defect control that must go red first.

## Why

The helper is pinned and the line that calls it is not, so a tool can stop using it unnoticed.

## Done when

Each row fails on its stated counterexample.

## Evidence

Filled at landing: what ran and where its output is.
