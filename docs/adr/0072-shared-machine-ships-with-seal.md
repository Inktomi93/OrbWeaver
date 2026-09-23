---
kind: adr
status: active
updated: 2026-09-23
---

# A shared machine ships with its seal

## Context

Not recorded in the ledger row.

## Decision

**A machine ships WITH its seal.** A shared machine (a composite, a factory, a skin fragment, a plumbing mint) ships in the SAME wave as the gate that closes its raw-path door — mint → migrate every site → SEAL, atomically; a composite without its gate is a DEFECT, not a milestone. The audit class "machine exists, adoption optional" no longer applies (root cause of the `WorkloadFormDialog`/`useBoundField`/`QueryErrorState` re-rot vs `ConfirmDialog`+G7 which held). Companion homes: ui skin fragments live in `ui/src/lib/` sealed by G25 `ui-skin-fragment-purity` (a new fragment = a new signature row — the gate grows with the tier); client registry/store plumbing lives behind mints (G26–G28, derive-W3). Program record: `../architecture/history/derive-modernization-audit.md` §0.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
