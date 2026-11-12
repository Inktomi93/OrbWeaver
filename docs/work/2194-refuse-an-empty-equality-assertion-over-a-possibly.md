---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: tests
plan: test-enforcement
---

# Refuse an empty-equality assertion over a possibly empty filter

## What

The empty-population ban does not cover filter(...).toEqual(\[]) over a list that may itself be empty.

## Why

The assertion passes vacuously when the recorder never captured anything.

## Done when

The shape is refused unless the source list is first asserted non-empty, with a plant row.

## Evidence

Filled at landing: what ran and where its output is.
