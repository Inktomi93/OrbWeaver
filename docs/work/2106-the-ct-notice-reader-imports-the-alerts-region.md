---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# The CT notice reader imports the alerts region name

## What

ALERTS_REGION_NAME in tests/support/node/ct-notice.ts retypes the label from toast.tsx.

## Why

A retyped label drifts from production.

## Done when

The reader imports the production label.

## Evidence

Filled at landing: what ran and where its output is.
