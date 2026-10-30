---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: testing
plan: surface-walk
---

# Move the type-ramp collector into auditSurface

## What

The type-ramp census collector lives inline in tests/client/features/app-shell/type-ramp-census.suite.ct.tsx. Raw collectors belong in testkit probes behind auditSurface.

## Why

Every product census should be able to request the ramp check instead of copying the collector.

## Done when

auditSurface accepts a typeRamp check from a testkit probe and the census calls auditSurface with density and typeRamp checks.

## Evidence

Filled at landing: what ran and where its output is.
