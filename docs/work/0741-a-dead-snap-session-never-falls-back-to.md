---
kind: tooling
status: open
updated: 2026-10-04
priority: P2
area: tooling
---

# A dead snap session never falls back to the live dev stack

## What

Side-eye's session calls hit the fixed 5000 ms base in tooling/src/snap/ops/session-call-watchdog.ts:10 under box load, and --pause or --stream-settle cannot extend it. After a session died, the next call silently started a new session pointed at the owner's live dev stack on port 5173 instead of the pinned stage. Side-eye closed it before any page loaded.

## Why

A review drive that silently lands on the live stack can write to the owner's data, and a 5 s ceiling makes session driving fail on a loaded box.

## Done when

A session call whose stage is gone refuses with the stage name instead of starting on another stack, and the session call budget scales with box load or takes a flag; a test pins the refusal.

## Evidence

Filled at landing: what ran and where its output is.
