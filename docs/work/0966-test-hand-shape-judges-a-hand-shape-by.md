---
kind: work
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# test-hand-shape judges a hand shape by its type relation to production

## What

Replace field-overlap thresholds with shared native relations at witnessed production-type boundaries under D328. Judge direct annotated initializers, native-resolved call arguments and explicitly typed returns. Handwritten boundary shapes derive from their canonical owner. Unassociated resemblance and unsupported provenance remain explicit analysis coverage, not copy violations.

## Why

Owner ruling: judge by type and declaration; a calibrated overlap threshold only approximates the boundary.

## Done when

The qualified floor reader supplies direct boundary associations and canonical declaration identity without a second resolver. Handwritten owned boundary declarations have discriminating controls. Native types judge assignability. Derived types pass; unrelated or unreachable shapes produce no hard copy finding. Unsupported coverage remains visible. The calibrated overlap threshold is gone.

## Evidence

Integrated at `32928876b0` after two independent verifier rounds: direct-boundary judgments through aliases, wrappers, containers, unions, function values and constrained generics, with every unsupported identity reported UNKNOWN. The whole-population qualification remains owed until 1051 fixes the evaluate cost. Evidence: `reports/review/966-hand-shape-final.md` in lane `wt/agent-a6985bb819dc9927c`.
Partial source is saved at `affa11ba8d` for driver transfer. Qualification remains open. See `reports/review/codex-driver-handoff.md` for ownership, checks and dependencies.

D328 bounds static assurance; native relation alone cannot distinguish copied intent from independent identical declarations. The consumed shape-reader subset qualifies before this gate changes. General shape equivalence remains with item 954. Implementation and qualification remain open.
