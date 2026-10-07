---
kind: bug
status: doing
updated: 2026-10-07
priority: P1
area: testing
lane: codex/preset-ci-closure
---

# Preserve preset fork identity through the held-save race

## What

Diagnose repeated preset requests in the fork-once component test and repair the responsible behavior or fixture.

## Why

The held-save test records repeated requests before its follow-up edit and cannot establish fork identity.

## Done when

The native race proves a stable fork identity and follow-up save without duplicate persistence; unrelated mutations remain covered.

## Evidence

Filled at landing: what ran and where its output is.
