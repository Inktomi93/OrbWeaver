---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The unwired graph marks members of shapes stored as JSON

## What

A fields sweep deleted a member of a result shape stored as JSON, which broke listing the stored backfill results until a later fix; the graph reports such a member like any other unread field.

## Why

Deleting a member of a persisted shape breaks reading rows already stored, which no product read in the tree shows.

## Done when

A member of a shape that reaches a JSON column is reported with that column named, so a cleanup sees it is persisted, with a red-first fixture case.

## Evidence

Filled at landing: what ran and where its output is.
