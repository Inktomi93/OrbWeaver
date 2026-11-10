---
kind: bug
status: doing
updated: 2026-11-10
priority: P3
area: ui
lane: wt/agent-a866f791d38520b05
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
