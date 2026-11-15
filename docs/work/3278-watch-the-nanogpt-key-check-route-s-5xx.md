---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: credentials
---

# Watch the NanoGPT key check route's 5xx strikes

## What

Three 5xx answers from `/api/personalized/v1/models`, on probes at least 60 s apart, revoke the key with reason `unreachable` (`packages/server/src/domain/credentials/verbs/record-probe-outcome.ts`).

## Why

This is pre-existing for every hosted row, and the route's 5xx behaviour is unknown. Watch it only if NanoGPT's personalized route flaps.

## Done when

The owner rules whether a hosted row's key check 5xx keeps counting toward a strike, and the ruling is recorded.

## Evidence

Filled at landing: what ran and where its output is.
