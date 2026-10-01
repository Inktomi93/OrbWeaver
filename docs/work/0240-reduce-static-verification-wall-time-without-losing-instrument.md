---
kind: tooling
status: blocked
updated: 2026-10-01
priority: P1
area: verification
blocked: owner
---

# Reduce static verification wall time without losing instrument proof

## What

Reduce static verification time; retain the complete selected proof corpus.

## Why

Liveness dominates the affected-instrument stage. Timings are in `reports/prelaunch-closeout-2026-09-28/ORCHESTRATION.md`.

## Done when

Reduce wall time on the same changed set. Preserve source/spec selection, every policy and control, whole-tree verdicts, and run-slot artifacts. Narrowing alone does not complete this item.

## Design

Use the existing import graph to derive gate reach. Validate authored `defineGate` IDs against filenames. Only sources selecting the shared suite affect its policy scope. Shared infrastructure, unclassifiable gates, missing IDs, and unknown paths force full scope. Direct/full runs retain every policy and control.

Share only identical ordered interventions; prove every distinct intervention alone, including explicit control batches. Keep complete overlays, shared corpus, refusal channels, and baseline checks. Add-only cases with nonempty `reportsAt` require measured baseline silence because their anchors may already exist.

### Rejected options

- Dropping specs, cases, or controls changes the denominator.
- Filename-only IDs and a second import graph weaken or duplicate selection.
- Overlay caps and cross-report replay cannot prove input independence. A policy can report only at its own path because another file exists.
- Reordering overlays or sharing different interventions changes inputs.
- Reusing verdicts across interventions can hide changed semantics.

### Coupled sites and controls

Selection lives in `tooling/src/verify/lib/instrument-affected-reach.ts`, `tooling/src/verify/lib/instrument-affected-liveness.ts`, and `tooling/src/verify/ops/instrument-affected.ts`. Mirror tests preserve source attribution and fail-closed selection.

`tests/support/real-corpus-liveness.ts` owns intervention isolation and timing. `tests/tooling/verify/gates/real-corpus-liveness-family.suite.repo.int.test.ts` proves:

- Every selected case survives; identical interventions share without a size cutoff.
- An own-path-only hidden dependency reports with its complete intervention and stays silent alone or beside another policy's intervention.
- Existing-anchor baseline findings are rejected; the overlay-dependent twin passes baseline and reports afterward.
- Duplicate-key, dead-companion, resource, mode, grant, and healthy controls remain effective.
- Timing retains policy/fact denominators and solo verdicts; cached reads produce no new pass measurements.

### Performance and verification

Timings cover preparation, overlays, execution, restoration, and policy/fact phases. Resolution caching reduces measured overlay execution cost; broader same-changed-set verification performance remains deferred.

ts-morph already passes its previous program to TypeScript `createProgram` and retains unchanged source objects. Another corpus cache duplicates that reuse. Resource hosts, facts, and reference caches remain invocation-local.

The resolution cache matches fresh solo findings, refusals, grants and populations. Controls cover changed exports, disk twins, globals, fact/resource changes and failed resolution recovery.

Main owns the frozen benchmark. Compare durations, scope, pass timings and test reports. Retain serial execution and complete proofs.

## Evidence

Owner deferred this work. Resume only on an explicit owner request.

Narrowing is in `e9fe219ff`; resolution caching is in `2d2b27975`. Pre-commit checks the staged diff.

The optimized liveness roster passed; matching overlay batches took 8.5% less time. The uncached baseline precondition passed after catch-census regeneration. Policy and pass populations match, but that correction prevents a strict identical-byte timing claim.

The static barrier passed at `b7f4d564d`. Its affected-instrument stage selected nothing after the push advanced the remote base, so behavioral evidence remains separate. This does not complete the broader same-changed-set performance criterion.
