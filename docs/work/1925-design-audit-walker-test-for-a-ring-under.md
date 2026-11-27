---
kind: tooling
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-a8a76b60ece6b02c7
plan: surface-walk
---

# Design audit walker test for a ring under non-forwarding prose fails on main

## What

tests/tooling/design-audit-walker.ct.tsx line 212 expects a tight measure below the alone measure and gets equal values. Find whether the walker or the fixture changed.

## Why

A red instrument test hides a real regression in the audit.

## Done when

The cause is named and the test passes against a real measurement.

## Evidence

Filled at landing: what ran and where its output is.
