---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# The mutation run's survivor note claims mirror tests after named tests replaced them

## What

`SURVIVOR_NOTE` in `tooling/src/mutation-run/lib/summary.ts` says only the mirrored tests ran, even when `--tests` replaced the mirror, as in every `pnpm test:mutation:targets` run.

## Why

The note misreports which tests ran, so a survivor reads as a mirror gap when it is not.

## Done when

The note names the mirror only when the mirror ran, and a run with named tests prints no mirror claim.

## Evidence

Filled at landing: what ran and where its output is.
