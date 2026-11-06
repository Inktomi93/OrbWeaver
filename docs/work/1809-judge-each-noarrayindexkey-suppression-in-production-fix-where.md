---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Judge each noArrayIndexKey suppression in production: fix where the list can reorder, or keep it with a reason

## What

Judge each noArrayIndexKey suppression in production client code. Fix it with a stable key where the list can reorder, and keep it with a reason where the order is fixed.

## Why

An index key on a list that reorders makes React reuse the wrong row state. A suppression with no reason hides which lists are safe.

## Done when

Every remaining noArrayIndexKey suppression in packages/client/src carries a reason on its line that names why the order is fixed. Every list that can reorder uses a stable key.

## Evidence

Filled at landing: what ran and where its output is.
