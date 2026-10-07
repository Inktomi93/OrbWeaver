---
kind: bug
status: doing
updated: 2026-10-06
priority: P1
area: release
lane: main
---

# Make packaged media installation independent of release API throttling

## What

Make the required packaged media executable install reliably without an unauthenticated release metadata lookup.

## Why

A failed download aborts installation before the application starts.

## Done when

The required executable remains verified. Tests cover download failures and platform asset selection. Native platform verification limits are explicit.

## Evidence

Filled at landing: what ran and where its output is.
