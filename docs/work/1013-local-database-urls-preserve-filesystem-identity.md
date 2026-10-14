---
kind: bug
status: open
updated: 2026-10-14
priority: P1
area: db
plan: test-foundation
---

# Local database URLs preserve filesystem identity

## What

Reconcile canonical local database path parsing with native libSQL URL handling. The corpus pipeline reproduces parent creation at a literal percent sequence while the driver opens a decoded name. Survey bare relative, absolute and authority forms, DataLayout producers and lifecycle consumers before changing the contract.

## Why

Directory preparation, database opening, backup and clone operations must identify the same file. A valid synthetic corpus directory must not redirect database access through inconsistent URI decoding.

## Done when

Native database controls prove exact file identity for supported path and URL forms, including literal percent sequences and ordinary spaces. Preserve relative-path semantics, in-memory and remote behavior, backup and shutdown ownership. Fix canonical owners without copied parsers, casts, new suppressions or migration resets. The corpus uses the same path contract.

## Evidence

Reviewed source `7b51587bb8` aligns native pathname decoding with canonical filesystem URL production and backup inspection. Native file controls fail before the fix and pass with it; coupled boot, layout, environment and stage cases pass. DB and server types and exact lint pass; root retains unrelated inference errors. The corpus assignment owns its canonical consumer integration. Native statement disposal is a separate lifecycle defect, not an unresolved pathname finding.
