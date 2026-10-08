---
kind: tooling
status: doing
updated: 2026-10-08
priority: P3
area: verification
lane: main
---

# Reduce static verification wall time without losing instrument proof

## What

Reduce static verification time; retain the complete selected proof corpus.

## Why

Liveness dominates the affected-instrument stage. Timings are in `reports/prelaunch-closeout-2026-09-28/ORCHESTRATION.md`.

## Done when

Reduce wall time on the same changed set. Preserve source/spec selection, every policy and control, whole-tree verdicts, and run-slot artifacts. Narrowing alone does not complete this item.

## Design

Use the existing import graph to derive gate reach. Validate authored `defineGate` IDs against filenames. Only sources selecting corpus specifications affect their policy scope. Shared infrastructure, unclassifiable gates, missing IDs, and unknown paths force full scope. Direct/full runs retain every policy and control.

Share only identical ordered interventions; prove every distinct intervention alone, including explicit control batches. Keep complete overlays, refusal channels, and baseline checks. Independent proof corpora may execute concurrently within native runner resource limits. Each corpus restores its intervention before starting another. Add-only cases with nonempty `reportsAt` require measured baseline silence because their anchors may already exist.

### Rejected options

- Dropping specs, cases, or controls changes the denominator.
- Filename-only IDs and a second import graph weaken or duplicate selection.
- Overlay caps and cross-report replay cannot prove input independence. A policy can report only at its own path because another file exists.
- Reordering overlays or sharing different interventions changes inputs.
- Reusing verdicts across interventions can hide changed semantics.

### Coupled sites and controls

Selection lives in `tooling/src/verify/lib/instrument-affected-reach.ts`, `tooling/src/verify/lib/instrument-affected-liveness.ts`, and `tooling/src/verify/ops/instrument-affected.ts`. Mirror tests preserve source attribution and fail-closed selection.

`tests/support/real-corpus-liveness.ts` owns intervention isolation and timing. Native corpus entry points call `tests/tooling/verify/gates/_liveness/runner.ts` to prove:

- Every selected case survives; identical interventions share without a size cutoff.
- An own-path-only hidden dependency reports with its complete intervention and stays silent alone or beside another policy's intervention.
- Existing-anchor baseline findings are rejected; the overlay-dependent twin passes baseline and reports afterward.
- Duplicate-key, dead-companion, resource, mode, grant, and healthy controls remain effective.
- Timing retains policy/fact denominators and solo verdicts; cached reads produce no new pass measurements.

### Performance and verification

Timings cover preparation, overlays, execution, restoration, and policy/fact phases. Resolution caching reduces measured overlay execution cost; broader same-changed-set verification performance remains deferred.

ts-morph already reuses its previous program. Resource hosts, facts and reference caches remain invocation-local.

The resolution cache matches fresh solo findings, refusals, grants and populations. Controls cover changed exports, disk twins, globals, fact/resource changes and failed resolution recovery.

Main owns the frozen benchmark. Compare durations, scope, pass timings and test reports. Retain complete proofs and isolated corpus ownership.

## Evidence

The owner authorizes independent corpus partitions. Preserve the complete selected policy and control population across native test entry points.

Resolution caching is in `1820f32165`. The native partition floor preserves existing collection and refusal controls. Whole-roster performance and hosted qualification remain pending.
