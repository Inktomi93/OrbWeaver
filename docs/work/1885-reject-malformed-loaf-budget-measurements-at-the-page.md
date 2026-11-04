---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: tooling
plan: restoration-register
---

# Reject malformed LoAF budget measurements at the page boundary

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B041-435`: Validate each consumed required frame timing and row shape in motionSnapshot using existing page validation primitives before returning the typed snapshot.

Inspect `tests/tooling/motion-audit/ops/page-validate.test.ts`, `tests/tooling/motion-audit/index.test.ts`, `tooling/src/motion-audit/ops/page-validate.ts`, `tooling/src/motion-audit/ops/drive.ts`.

## Why

`AF3-B041-435`: The container-only check allows a missing blockingDuration to become NaN and compare as within budget under otherwise valid evidence.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B041-435`: Existing boundary/evaluator tests reject nested missing/nonfinite timing with an index/field-specific error and accept valid finite rows. Preserve legitimate optional old-bundle members. Native controls remain owed; no observed runtime incident claimed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
