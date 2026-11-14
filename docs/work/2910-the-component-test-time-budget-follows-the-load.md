---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: tests
plan: test-foundation
---

# The component test time budget follows the load during a run

## What

Ruled: the budget is re-read during a run. The component test config reads the box's load once when it loads and scales its expect budget from that reading. A whole run that gets busier afterwards keeps the unscaled budget, and cases that wait on a client retry or a room read then fail on time. Read the load where the budget is applied, per test or per worker start, through the one existing load-scaling helper; no case gains a private timeout.

## Why

Two cases in one whole run failed this way and passed alone, which costs a rerun to tell from a defect.

## Done when

A run that starts quiet and gets busy scales its expect budget from a reading taken during the run, the scaling has one home, and a fixture proves the budget follows a changed reading.

## Evidence

Filled at landing: what ran and where its output is.
