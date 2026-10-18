---
kind: bug
status: open
updated: 2026-10-18
priority: P1
area: tooling
plan: test-foundation
---

# Application Knip reports findings outside the production baseline

## What

Once testkit factory ids stopped breaking Playwright collection (1df65d705c), the canonical application Knip stage (pnpm exec node tooling/src/verify/cli.ts application-static knip) completed for the first time in a while and exited 1: unused files, exports and exported types that knip-production.baseline.json does not admit. The stage was a tool error before, so these findings were hidden. Plain pnpm knip:prod reports a different set, so the baseline and the canonical stage disagree on population.

## Why

The production export baseline is meant to be shrink-only and exact for the CI stage; a stage that has been tool-erroring hid new unused exports, and a baseline reconciled against a different Knip view cannot gate them.

## Done when

The application stage and the baseline agree: each extra finding is either fixed, adjudicated under item 989, or shown to come from a stage-population defect that is then corrected; the stage exits 0 on main.

## Evidence

Filled at landing: what ran and where its output is.
