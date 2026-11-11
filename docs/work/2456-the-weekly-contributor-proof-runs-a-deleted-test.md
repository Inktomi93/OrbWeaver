---
kind: bug
status: blocked
updated: 2026-11-11
priority: P1
area: tooling
blocked: owner
evidence: a6870afcfb
---

# The weekly contributor proof runs a deleted test file and is red by construction

## What

.github/workflows/contributor.yml:130 runs pnpm test:tools tests/tooling/generated-css-drift.repo.int.test.ts, a file deleted by e617b360ea. Reproduced on this tree: exit 1, "No test files found". The step is therefore red every week on both macOS and Windows, training everyone to ignore the proof red. The replacement, tests/ui/styles/generated-theme-drift.repo.int.test.ts, sits under tests/ui/, which test:tools explicitly excludes, so pointing the step at the new path with the same runner would still find nothing. Source: reports/codebase-review/units/root-ci.md.

## Why

A standing weekly red destroys the value of the only contributor-facing proof in the repo; the next real failure is indistinguishable from the habit.

## Done when

The weekly step runs the replacement drift test on a runner that includes tests/ui/ and passes green on a fresh install, and no contributor workflow step is red-by-construction.

## Evidence

Filled at landing: what ran and where its output is.
