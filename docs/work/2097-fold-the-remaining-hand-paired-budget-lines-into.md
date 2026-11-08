---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# Fold the remaining hand-paired budget lines into records per module

## What

Thirteen or more tooling modules still pair each load-scaled ceiling with its base by hand outside snap/lib/budgets.ts, starting with materialize-devtools and nav.ts. The list is in the M7 review report under reports/code-reviewer.

## Why

A hand pair can drift from the one bases table.

## Done when

Each module reads its ceilings from one record per module, and no hand-paired budget line remains.

## Evidence

Filled at landing: what ran and where its output is.
