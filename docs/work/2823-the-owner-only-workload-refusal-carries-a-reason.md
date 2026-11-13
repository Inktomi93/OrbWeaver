---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: server
lane: wt/agent-a9b7b7b15204242ef
plan: cross-surface-consistency
---

# The owner-only workload refusal carries a reason code

## What

The owner-only refusal for a workload reaches the client as a bare forbidden answer with no reason, so the schedule dialog keys its owner-only notice on the status alone.

## Why

Any other forbidden answer from that call would show the owner-only text.

## Done when

The refusal carries a code from contracts, the client keys its notice on that code, and a test shows a different forbidden answer keeps the general failure text.

## Evidence

Filled at landing: what ran and where its output is.
