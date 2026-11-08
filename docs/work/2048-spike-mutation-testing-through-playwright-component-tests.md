---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-a8d76e9be06cea518
plan: test-foundation
---

# Spike mutation testing through Playwright component tests

## What

Stryker's Vitest runner cannot run our CTs, so client files proven mostly by CT report no coverage. Try stryker-playwright-runner and its JSX mutators from github.com/LayZeeDK/lz-playwright-test on one CT-covered file, transcript-window\.tsx, after pnpm test:mutation lands. It uses mutant switching through a context init script, one instrumented build and per-test coverage. It relies on undocumented Playwright internals, and our CT serves a production preview build.

## Why

The hottest client files are proven by CT, so mutation testing cannot grade them today, and a no-coverage result there reads as no tests.

## Done when

A run on one CT-covered file reports real kills and survivors, a hand-checked sample of survivors is true, and the record says adopt, vendor or drop with the reason.

## Evidence

Filled at landing: what ran and where its output is.
