---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Split the code-facts and compiler engine files over their line cap

## What

max-lines still fires on tooling/src/floor/code-facts/\*, floor/compiler/{semantic-inventory-extract,invocation-evidence-extract,ts-workspace}, verify/lib/project-context.ts, floor/code-facts/drizzle-sql.ts (already over on main) and verify/ops/policy-conformance.ts. These files change many times a week under the shared-reader lanes (953 to 957, 1098), so a split now collides with every sibling.

## Why

A file over its cap hides seams and makes every review larger; splitting it during active lane work causes conflicts.

## Done when

Each file sits under its cap along real seams, with its tests and registration lists updated, scheduled when the shared-reader lanes are quiet.

## Evidence

Hosted run `39483788717` emits the engine file-cap findings. The exact paths and locations are recorded in `reports/review/ci-39483788717/triage.md`.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
