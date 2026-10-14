---
kind: bug
status: blocked
updated: 2026-10-14
priority: P1
area: workloads
blocked: on 984
plan: inference-flow
---

# Persist the admitted funder for ownerless model workloads

## What

Preserve the explicitly admitted funder through ownerless workload persistence, dispatch and retry. Keep enumeration authority distinct from funding and the synthetic audit actor. Do not create a system account or borrow an unrelated connection.

## Why

An admitted box-owner bulk distill loses its saved summarize binding because execution resolves the synthetic system actor as funder. The real workload fails before provider execution.

## Done when

Real owner bulk distill and themes use their persisted authorized funder. System workloads remain unfunded without explicit authorized funding. Owned, retry, accounting, refusal and replacement controls pass without cross-owner fallback.

## Evidence

The native composed case `codex-every-owner-984-4042021-2026-10-14T05-53-50-725Z` admits a box-owner bulk distill with a saved summarize binding. Its real workload fails with the missing summarize-binding error before another provider request. No summary is produced.

The design preserves one nullable persisted funder, separate from scope and audit identity. Trusted admissions state funding explicitly; human admissions derive it from the Principal. Automatic unfunded bulk memory produces segments without inventing digest funding. Retry preserves stored funding, including absence.

Source implementation waits for canonical typed-authority integration; preserve its claim and deleted-owner refusal boundaries.

`packages/server/src/domain/workloads/engine/runner.ts` uses the synthetic system actor when the row owner is null. `packages/server/src/domain/discovery/workload-contributions.ts` passes that actor as funder. `packages/db/src/schema/workloads.ts` does not preserve the admitting funder. This is a caller identity defect; the qualified executor correctly refuses unavailable authority.
