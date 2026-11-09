---
kind: work
status: doing
updated: 2026-11-09
priority: P3
area: ui
lane: wt/agent-a327ea7fc17a97610
plan: cross-surface-consistency
---

# The narrow room island inset token describes its current role

## What

size.room-island-inset-narrow in packages/ui/src/tokens/tokens.json still describes a ring clearance of one tight step each side, but the composer region now steps in by the 10px avatar reach, which is wider than spacing.field.

## Why

A token description that no longer matches its role misleads the next change to the composer edge.

## Done when

The token description states its role under the 14px phone inset, and tokens:build output is unchanged in value.

## Evidence

Filled at landing: what ran and where its output is.
