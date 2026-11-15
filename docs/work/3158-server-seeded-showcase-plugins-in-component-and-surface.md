---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# Server-seeded showcase plugins in component and surface runs bypass the stale bundle refusal

## What

requireShowcaseBundle refuses a stale build. The server's own boot seeder and tests/support/node/surface-data.ts read packShowcaseBundle directly, so a run that seeds showcase plugins through the server still installs a stale dist without naming it. Decide whether the CT and surface preparation call the testkit freshness check before booting, through a seam the harness already has.

## Why

Component tests also reach showcase plugins through the seeded server, and that path fails on a plugin symptom instead of naming the stale build.

## Done when

A test run that seeds showcase plugins through the server refuses a stale built bundle by name before boot, with a planted stale-bundle case.

## Evidence

Filled at landing: what ran and where its output is.
