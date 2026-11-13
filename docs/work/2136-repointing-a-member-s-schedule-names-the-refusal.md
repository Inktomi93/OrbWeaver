---
kind: bug
status: open
updated: 2026-11-13
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

A refused repoint shows the server's refusal reason for every refusal the update path can throw, the owner-only refusal from `packages/server/src/domain/workloads/substrate/params.ts` included, with a CT that drives each refusal through the real procedure. Already merged: the run-account refusals, mapped in `packages/client/src/features/workloads/hooks/use-workload-mutations.ts`.

## Evidence

Filled at landing: what ran and where its output is.
