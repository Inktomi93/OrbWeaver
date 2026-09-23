---
kind: plan
status: active
updated: 2026-09-23
---

# Pane standardization: the shell forces what does not vary

## Goal

Every rail section's panes are consistent because each pane axis is enforced at the highest tier its legitimate variance allows.

## Shape

Measured drift tracks the enforcement tier: structural axes (the panel header band, the body padding) never drifted; type-forced fields (`content`, `context`, `useSelectionTitle`) never drifted; every optional slot and every convention drifted. So each axis goes as high up the ladder as its variance allows:

- **Zero legitimate variance: the shell renders it.** The LIST header band becomes structural via data: a section supplies a view hook and the shell renders `ListPaneHeader`; features stop authoring band JSX. A required JSX slot is not enough, because the drift happened inside a defined slot.
- **Per-section data with no legitimate absence: a required field.** CONTENT chrome gets one structural inset token, `--spacing-section`; an opt-out is a reason-carrying declaration in the house `{planned: "<reason>"}` grammar, never an absence.
- **Genuine per-section composition: convention plus a gate**, with the gate's blind spots stated.

Per axis: the CONTEXT band is required and pane availability is derived, not declared (the optional `panels` field is deleted); every roster LIST carries a search affordance; empty states keep the three-class floor with cause resolution; loading states are fixed in their one shared home; LIST anchors stay contained.

A designed divergence is recorded with its reason at the section definition, never left as a silent difference.

## Open questions

- Does the band go structural via data (default yes)?
- Does every roster LIST get search, including Extensions (default yes)?
- Is the content inset `--spacing-section` everywhere, with the presets editor's inset demoted (default yes)?
- Does the Extensions detail-panel toggle disappear once availability is derived (default yes)?

## Rejected

- A required band slot with a convention on its contents: a defined slot already drifted.
- Four literal empty-state variants on every section: it mints dead states where a cause is unreachable.
- A per-section inset token: the choice itself is the drift.

## Coupled sites

- `packages/client/src/state/section-registry.ts` (`SectionDefinition`)
- `packages/client/src/lib/registry-contracts.ts` (the context contracts)
- `packages/client/src/features/app-shell/` (the shell consumers)
- `packages/client/src/components/list-pane-header.tsx`
- every `features/*/lib/*-section.tsx` definition
- the shell CT family

## Test plan

- Type tests that a section cannot omit the band hook or the content inset declaration.
- A gate for band anatomy and search presence, with a planted section that omits each.
- The shell CT family re-run in full after each shell-mount change.
