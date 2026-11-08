---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a0d8661637829aec9
plan: test-foundation
---

# Home lists refuse a glob typed as a plain string

## What

A glob typed as a plain string passes the home helpers' type, and several home lists have no neighbour row in their tests.

## Why

A home list that accepts a glob can widen an exemption silently.

## Done when

The helper type refuses a plain string glob with a plant that fails tsc, and each home list has a neighbour row.

## Evidence

Filled at landing: what ran and where its output is.
