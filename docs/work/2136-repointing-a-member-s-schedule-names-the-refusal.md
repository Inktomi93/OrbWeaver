---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Repointing a member's schedule names the refusal reason

## What

packages/client/src/features/workloads/hooks/use-workload-mutations.ts shows the generic Couldn't update the schedule when the owner repoints a member's schedule and the server refuses it. Show the refusal reason the server sends.

## Why

A generic failure gives the owner no way to see why the repoint failed or what to change.

## Done when

A refused repoint shows the server's refusal reason, with a CT that drives the refusal through the real procedure.

## Evidence

Filled at landing: what ran and where its output is.
