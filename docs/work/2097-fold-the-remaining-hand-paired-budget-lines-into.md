---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: test-foundation
---

# Fold the remaining hand-paired budget lines into records per module

## What

Some tooling modules still pair each load-scaled ceiling with its base by hand, starting with materialize-devtools and nav.ts.

## Why

A hand pair can drift from the one bases table.

## Done when

Each module reads its ceilings from one record per module, and no hand-paired budget line remains.

## Evidence

Filled at landing: what ran and where its output is.
