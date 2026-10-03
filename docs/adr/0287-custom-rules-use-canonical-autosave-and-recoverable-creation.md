---
kind: adr
status: active
updated: 2026-10-03
---

# Custom rules use canonical autosave and recoverable creation

## Context

Custom rule authoring must preserve typed actions, explicit enabling and drafts whose creation outcome is uncertain.

## Decision

Mount custom rule editors through the canonical autosave session. Create only complete valid rules, born disabled; enabling remains separate. Use an owner-scoped request identity with server-minted row identity. Retain that identity across ambiguous outcomes and preserve newer drafts after acknowledgment. Keep recovery scoped to the owner and target. Use typed controls and the existing caller-owned tool catalog and execution paths. Homes: packages/client/src/features/automation/, packages/client/src/forms/editor/, packages/client/src/state/rule-creation-store.ts, and packages/contracts/src/automation/.

## Consequences

Creation recovery cannot recreate an acknowledged missing row or overwrite newer local work. Discard affects local drafts, not saved rules. Existing presets and scope-specific action eligibility remain available. The canonical form owns save scheduling, draft reconciliation and invalid-field focus.

## Alternatives rejected

Reject whole-rule JSON authoring, caller-selected row identities, placeholder actions, separate save engines and separate execution paths.
