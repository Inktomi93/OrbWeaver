---
kind: adr
status: active
updated: 2026-09-23
---

# A shared machine ships with its seal

## Context

A shared composite, factory or mint gives a shape one home. Without a gate, nothing stops a site from hand-rolling the same shape beside it. Old sites keep the raw path and new sites copy them. The machine then becomes a second home instead of the only home. `ConfirmDialog` stays the only feature-tier confirm because `confirm-uses-composite` fails any `features/**` import of the raw `@orb/ui/alert-dialog`.

## Decision

**A machine ships WITH its seal.** A shared machine (a composite, a factory, a skin fragment, a plumbing mint) ships in the SAME wave as the gate that closes its raw-path door — mint → migrate every site → SEAL, atomically; a composite without its gate is a DEFECT, not a milestone. The audit class "machine exists, adoption optional" no longer applies (root cause of the `WorkloadFormDialog`/`useBoundField`/`QueryErrorState` re-rot vs `ConfirmDialog`+G7 which held). Companion homes: ui skin fragments live in `ui/src/lib/` sealed by G25 `ui-skin-fragment-purity` (a new fragment = a new signature row — the gate grows with the tier); client registry/store plumbing lives behind mints (G26–G28, derive-W3).

## Consequences

Every new machine costs its gate and its full migration up front. A finding of the form "the machine exists, adoption is optional" is a defect to fix now. A gate grows with its tier: a new fragment or mint adds a row to its gate.

## Alternatives rejected

- Ship the machine and migrate sites over time. Sites do not migrate, and new hand-rolled copies appear beside the machine.
- Hold adoption by review or prose. A boundary with no enforcer does not hold for authors with no memory; every placement names its enforcer (`docs/law/Core-0-Architecture-and-Structure.md`).
