---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: workloads
plan: authorization-and-visibility
---

# A disabled owner's schedule says why it is not running

## What

A schedule whose owner is disabled lists with a stale next run time and no reason. `listSchedules` carries only the reason for a caller who is not the box owner.

## Why

An admin reads a schedule that looks due and cannot tell why it never runs.

## Done when

The schedule list row carries a reason field for a disabled owner and the client shows it. The field names the schedule's state; no other surface gains account state.

## Evidence

Filled at landing: what ran and where its output is.
