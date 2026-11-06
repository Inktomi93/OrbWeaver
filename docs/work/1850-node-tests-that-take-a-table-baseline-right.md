---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
plan: test-foundation
---

# Node tests that take a table baseline right after creating a harness may race the background character seed: settle them through the harness

## What

Settle node tests that take a table baseline right after creating a harness through the harness, so they cannot race the background character seed.

## Why

A baseline taken while the seed still writes rows can include or miss seeded rows, so the test fails on some runs.

## Done when

Every node test that reads a table baseline after creating a harness waits on the harness settle step first, and repeated whole-suite runs show no such flake.

## Evidence

Filled at landing: what ran and where its output is.
