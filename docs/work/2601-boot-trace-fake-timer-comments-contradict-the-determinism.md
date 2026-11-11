---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# Boot-trace fake-timer comments contradict the determinism law

## What

`tests/tooling/cpu-profile/boot-trace.suite.int.test.ts` calls its fake timers work awaiting the frozen clock. Its subject is a direct `setTimeout` budget in `tooling/src/cpu-profile/ops/boot-trace.ts`, which the law allows.

## Why

A reader is told to migrate a use the law sanctions.

## Done when

The comments state the timer window they drive, or the budget takes an injected timer and the fake timers go.

## Evidence

Filled at landing: what ran and where its output is.
