---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
area: tooling
blocked: owner
---

# Hosted maintained node controls fail project selection and corpus lifecycle qualification

## What

The maintained node CI artifact at `reports/review/ci-39469280964-node-artifact/test-report.json` records a project-selection assertion mismatch and timeouts in corpus-fixture-lifetime, corpus-search and corpus controls. The project-selection case includes the native argv separator; its configured mode set includes OIDC while the asserted set omits it. The timeout causes are not diagnosed.

## Why

These maintained controls prevent complete node qualification. A timeout is not a behavioral verdict or evidence of a flake.

## Done when

Reproduce each failure against the exact selected population, correct the actual runner or fixture defect without dropping cases, and qualify native project selection plus corpus producer, clone and search lifetimes. Measure contention before changing timing budgets.

## Evidence

Hosted run `39483788717` repeats the OIDC selection mismatch and private-copy lifecycle timeout. Other historical corpus failures remain unqualified, not reproduced by this run. Evidence: `reports/review/ci-39483788717/triage.md`.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.

The maintained corpus runtime portion continues in work 1226. The project-selection and checker requirements remain parked here.
