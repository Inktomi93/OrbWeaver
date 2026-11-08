---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
---

# A paused schedule that is also refused still reads as paused

## What

packages/client/src/features/workloads/components/schedules-section.tsx shows the refusal where it said Paused, so a schedule that is both paused and refused loses its paused state on the row.

## Why

The row must show both facts; a user who resumes a refused schedule needs to know it is also paused.

## Done when

A paused and refused schedule row names both states, with a CT for that row.

## Evidence

Filled at landing: what ran and where its output is.
