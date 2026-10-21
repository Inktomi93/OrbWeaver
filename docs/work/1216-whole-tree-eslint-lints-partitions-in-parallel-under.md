---
kind: work
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Whole-tree ESLint lints partitions in parallel under a memory budget

## What

runPartitions (tooling/src/verify/ops/eslint-profile.ts:216) lints compiler-owner partitions one at a time through a blocking runNicedSync, each child with --concurrency off: whole-tree lint took 15:04 at a 10.3 GB peak on a 24-core box. A bare eslint --concurrency 8 run built projectService programs per worker, peaked at 90 GB and was killed. Timings: reports/review/lint-wholetree/.

## Why

Independent partitions serialised on one core make the whole-tree lint and CI static job slow; the CI per-run 16 GB bar still holds.

## Done when

The runner runs independent partitions concurrently up to a configured memory budget (default sized for the 16 GB CI bar, larger locally), with identical findings and a measured before and after on the whole tree.

## Evidence

Hosted run `39483788717` reaches dependency-wide ESLint before cancellation at the configured job limit. The transcript establishes neither complete lint qualification nor the sole timeout cause. Evidence: `reports/review/ci-39483788717/triage.md`.

Typed parser-owner routing is corrected on main at `10a78e5a20`. Native owner, cache and mandatory-profile controls qualify the correction. The scheduler lane must retain that routing before calibration. Evidence: `reports/review/compiler-world-investigation/investigation.md`. Scheduler integration and measured production budgets remain open.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
