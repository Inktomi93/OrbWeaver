---
kind: bug
status: open
updated: 2026-11-26
priority: P3
area: testing
plan: test-foundation
---

# Three component tests fail only inside a full corpus run

## What

trust-door-landing.ct.tsx:56, message-avatar-reach.ct.tsx:242 (390 115% text compact echo) and provider-wait-line.ct.tsx:85 fail in a full run of every corpus CT, yet pass alone twice in a row. trust-door-landing also failed in the earlier full run.

## Why

A case that turns red only under load hides whether a real regression is there, and CI shards run under load too.

## Done when

Each case's load dependence is found from its trace in a full run (a timing wait, an animation or a layout read before settle) and fixed, and each passes in two consecutive full corpus CT runs.

## Evidence

Filled at landing: what ran and where its output is.
