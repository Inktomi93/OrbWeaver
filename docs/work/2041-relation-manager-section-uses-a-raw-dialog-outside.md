---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: ui
plan: type-law
---

# relation-manager-section uses a raw Dialog outside the composites

## What

The components tier renders a raw Dialog in relation-manager-section, so the FormDialog and DismissDialog type guards do not reach it.

## Why

A dialog outside the composites can lose its dismiss path, and that is what the composites exist to stop.

## Done when

It moves to a composite, or the reason it cannot is recorded.

## Evidence

Filled at landing: what ran and where its output is.
