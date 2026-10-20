---
kind: bug
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# CI skips every check when change classification times out

## What

The CI changes job has a 5-minute timeout (.github/workflows/ci.yml:53). On push 431c52694f its first step, scripts/ci-qualification.ts baseline against the last qualified baseline about 250 commits back, ran past it; the run was cancelled, every check job was skipped, and ci-ok reported failure. Run 39427786865 produced no static, node, CT or e2e verdict.

## Why

D317 makes CI the verdict; a large push that skips every check is no verdict, and it fails silently.

## Done when

Classification has a measured budget that holds for a large push, and if it cannot decide in time CI runs the full check set instead of skipping it, proven by a workflow test or a dry run against a large commit range; the next large push gets a full verdict.

## Evidence

Filled at landing: what ran and where its output is.
