---
kind: bug
status: doing
updated: 2026-10-08
priority: P1
area: testing
lane: codex/select-native-source-retention
---

# Diagnose hosted Select first-open blocking

## What

Attribute the native first-open blocking failure and repair a demonstrated cause without widening performance budgets.

## Why

A retry can conceal first-open work that exceeds the required blocking budget.

## Done when

Native evidence distinguishes fixture contention from application work; any repair preserves cold first-open semantics and the existing budgets.

## Evidence

The ordinary first-open budget fails in hosted and local native runs. Product source and performance budgets remain unchanged.

Profiler-on and trace-only diagnostics execute the same cold render and compilation path with different observed durations. These observations do not establish the original failure's cause.

The original-cohort trace-only capture brackets the actual first and repeat opening. A failing native trace is needed before a source repair is justified.

Native trace finalization retains its referenced emitted bundles and source maps before CT lease cleanup without changing measurement. Native and deterministic file tests prove retention.
