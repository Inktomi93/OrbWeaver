---
kind: work
status: blocked
updated: 2026-09-23
priority: P3
area: client
blocked: owner
---

# Re-measure home-boot layout shift on a production build

## What

Measure home-boot cumulative layout shift on a production build: stage a client prod build, start `pnpm stack up prod` on a port other than 8788, and snap the home boot. The dev build measures 0.134 against a budget of 0.1.

## Why

Dev-build CLS is not the shipped number, and the investigation that found the gap is deleted.

## Done when

Wake when a prod-build window is scheduled. Done when the prod number is recorded here and, if it exceeds 0.1, the cause is fixed or filed.

## Evidence

Filled at landing: what ran and where its output is.
