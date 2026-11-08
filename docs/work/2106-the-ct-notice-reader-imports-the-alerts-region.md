---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a255419bb88fd5e35
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
