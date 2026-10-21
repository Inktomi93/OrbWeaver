---
kind: bug
status: open
updated: 2026-10-21
priority: P2
area: security
plan: test-foundation
---

# isNull owner terms acquit only code-constant system-plane writes

## What

isNull(T.ownerId) counts as an owner term, so a caller-driven write to ownerless shared rows (seed themes, the system default preset) passes with no finding. The live system-seed writes are theme-queries.ts:121 and :152 and preset queries.ts:223, each with code-constant ids and no Principal.

## Why

An unowned shared row written from caller input is a tenancy bypass; waivers for the seeds would raise the budget, which fix-not-excuse forbids.

## Done when

The bounded write check rejects caller-derived shared-row keys and content. Unclosed provenance is an explicit advisory unknown, not caller authority. Private seed operations construct shipped keys and content without accepting caller rows, configuration or versions; injected time remains metadata. Native import and export restrictions enforce the declared seed boundary. Production-root controls prove shared convergence and owned-row preservation, including an ownership change during reseed. Qualify affected compiler programs, the complete policy population and authority accounting without new waivers, grants or budget growth.

## Evidence

Filled at landing: what ran and where its output is.

The constant-only premise conflicts with the injected boot clock and seed producers. D328 governs the bounded native successor and the revised acceptance above; it does not require general callable or escape proof. The implementation and scoped evidence are in `reports/review/1190-1192-tenancy-write-implementation.md`. Independent security review in `reports/review/1190-1192-security-review.md` confirms the bounded source outcome after corrections. Affected native compiler programs pass. Complete-population and authority qualification remain open.

The complete-policy attempt aborts with a controller heap failure during SQLite materialization. Its incomplete output establishes no policy verdict, grant consumption or budget qualification. Evidence: `reports/review/1190-1192-qualification-plan.md`.

The reviewed bounded implementation is integrated at `f08b8ea44d`. Source integration does not close complete-policy and authority qualification. The shared observation repair owns the prerequisite.

The repaired capture still exceeds the aggregate memory budget during actual complete-policy qualification. The stopped run supplies no owner or authority verdict. Evidence: `reports/review/1153-real-policy-resource-failure.md`.
