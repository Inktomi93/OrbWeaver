---
kind: bug
status: blocked
updated: 2026-10-21
priority: P1
blocked: owner
---

# CI skips every check when change classification times out

## What

The CI changes job has a 5-minute timeout (.github/workflows/ci.yml:53). On push 431c52694f its first step, scripts/ci-qualification.ts baseline against the last qualified baseline about 250 commits back, ran past it; the run was cancelled, every check job was skipped, and ci-ok reported failure. Run 39427786865 produced no static, node, CT or e2e verdict.

## Why

D317 makes CI the verdict; a large push that skips every check is no verdict, and it fails silently.

## Done when

Classification has a measured budget that holds for a large push, and if it cannot decide in time CI runs the full check set instead of skipping it, proven by a workflow test or a dry run against a large commit range; the next large push gets a full verdict.

## Evidence

Run-backed discovery avoids unpublished workflow-tree reads. The bounded workflow discards partial classifier output and selects every runtime job after failure. Failed discovery grants no baseline authority; version checks refuse and `ci-ok` stays red under D307. Independent review and focused ancestry, producer, workflow and timeout controls pass. Evidence: `reports/review/1215-ci-classification-review.md` and `reports/review/1215-ci-classification-delivery.md`.

Hosted run `39469280964` completes classification within its budget and executes the application jobs. Smoke and maintained CT pass; other jobs report failures. Static qualification remains incomplete because entry-membership collection refuses a shared helper origin. The reader correction is on main at `bdd658f11f`; hosted acceptance remains open until CI measures the complete static population.

Hosted run `39483788717` completes classification and executes application jobs. Static reaches ESLint, then hits the configured job limit; complete hosted acceptance remains unqualified. Evidence: `reports/review/ci-39483788717/triage.md`.

Hosted run `39620796838` executes the pushed main candidate `a674872615`. The changes job completes through fallback after a historical GitHub API read fails. Application jobs finish with failures; static qualification remains incomplete. This does not establish strict classification or baseline authority. No classifier change is justified. Evidence: `reports/review/1215-current-hosted-qualification.md`. The lint scheduling item owns the independent performance work.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
