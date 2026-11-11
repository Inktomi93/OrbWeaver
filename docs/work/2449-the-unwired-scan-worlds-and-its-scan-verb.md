---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: unwired-code
---

# The unwired scan worlds and its scan verb match what the tool does

## What

`tooling/src/unwired/worlds.ts` says `TEST_WORLDS` is the same set `scripts/typecheck.ts` checks; typecheck also checks `tsconfig.tests-iso.json`, and `tooling/src/brand-flow/scan.ts` appends that world by hand. `tooling/src/unwired/run.ts` lists `scan` as a verb and its argument parser refuses the word. Source: `reports/codebase-review/units/tooling-unwired.md`.

## Why

A scan that skips a world can call a use test-only wrongly, and the tool's own vocabulary names an invocation that fails.

## Done when

The world tuple includes the iso world or its header states why the scans skip it, and brand-flow reads the same tuple without a hand-added entry. `pnpm unwired scan` runs the member scan or the word leaves the verb list and the usage text.

## Evidence

Filled at landing: what ran and where its output is.
