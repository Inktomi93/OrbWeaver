---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: connection
plan: cross-surface-consistency
---

# A test fails when listed pricing overrides declared pricing

## What

A price the user declared on a connection is meant to win over the price a hosted list reports. No test fails when that order is reversed.

## Why

The cost estimate would silently change for a user who set their own price.

## Done when

A case with both a declared and a listed price reads the declared one in the cost estimate, and fails when the precedence is reversed.

## Evidence

Filled at landing: what ran and where its output is.
