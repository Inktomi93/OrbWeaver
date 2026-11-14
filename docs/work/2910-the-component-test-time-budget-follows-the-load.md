---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: tests
---

# The component test time budget follows the load during a run

## What

The component test config reads the box's load once when it loads and scales its expect budget from that reading. A whole run that gets busier afterwards keeps the unscaled budget, and cases that wait on a client retry or a room read then fail on time.

## Why

Two cases in one whole run failed this way and passed alone, which costs a rerun to tell from a defect.

## Done when

The owner rules whether the budget is re-read during a run, pinned high for whole runs, or left as it is with the affected cases waiting on their own named bound, and the config follows.

## Evidence

Filled at landing: what ran and where its output is.
