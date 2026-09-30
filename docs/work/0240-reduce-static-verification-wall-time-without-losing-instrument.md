---
kind: tooling
status: open
updated: 2026-09-30
priority: P1
area: verification
---

# Reduce static verification wall time without losing instrument proof

## What

Reduce static verification wall time while retaining the complete selected proof corpus.

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

Timings cover preparation, overlays, execution, restoration, and policy/fact phases. Verification remains pending; no speedup is claimed.

ts-morph already passes its previous program to TypeScript `createProgram` and retains unchanged source objects. Another corpus cache duplicates that reuse. Resource hosts, facts, and reference caches remain invocation-local.

`Project.getTypeChecker()` returns a lazy wrapper; direct node methods can bypass it. Checker work remains inside policy/fact timings. Capture a native CPU profile to separate compiler construction/binding from readers. Avoid forced early compilation because dependency loading can alter subsequent population resolution.

A future cache must match fresh solo findings, refusals, grants, and populations. Plant changed exports through unchanged importers, removed imports with disk twins, globals, fact/resource changes, and failure followed by recovery.

Main owns red-first controls, suites, the barrier, and one benchmark after source freeze. Compare stage/suite duration, selected scope, pass timings, test count, and completed `test-report.json`. Retain serial execution. No owner fork changes proof requirements.

## Evidence

Narrowing is in `e9fe219ff`; wall time is not fixed. Pre-commit scopes to the whole working tree, not the staged diff. Liveness: 1317 s, ~240 builds of ~1.6 s.
