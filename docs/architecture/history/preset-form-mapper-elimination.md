---
kind: spec
status: done
updated: 2026-07-12
---

# Eliminate `PresetFormValues` + the flat-form mapper (client preset editor) — BUILT

> **Status: BUILT + retired to history (2026-07-12).** The proposal was taken: `PresetFormValues`,
> `presetFormValuesSchema`, and both `toPresetFormValues`/`toPromptConfig` mappers were DELETED from
> `@orb/contracts` (2026-07-11); the client preset editor binds the nested `PromptConfig` DIRECTLY
> via TanStack Form. All three surviving constraints hold — bounds still sourced from the one
> `generationKnobSchemas` object, server-only fields preserved via `mergeOnSubmit`, and the
> `assignIfDefined` absent→unset discipline (see `features/preset/lib/preset-editor-model.ts` + its
> round-trip test). The prose below is the original proposal, kept for the record.

## The current state (built + tested)

`@orb/contracts/preset` ships the flat `PresetFormValues` shape + `presetFormValuesSchema` + the
bidirectional mappers `toPresetFormValues` / `toPromptConfig` (a long manual field map — a real
maintenance tax: every new `PromptConfig` field needs a flat key + two mapper arms). The round-trip
is pinned by `tests/contracts/preset/index.contract.test.ts`. There are currently **zero consumers
outside contracts** — the client preset editor does not exist yet (`packages/client/src/features/`
is empty).

## The proposal

When the preset editor is built: **bind the nested `PromptConfig` shape directly via TanStack
Form's nested-path binding and delete `PresetFormValues` + both mappers.** Keep the flat shape +
mapper ONLY for a field TanStack cannot bind (e.g. an array-of-objects the library flattens).

**Decision criterion (crisp):** does TanStack Form bind every nested `PromptConfig` path the
editor touches? If yes — delete the mapper; the editor validates against `promptConfigSchema`
directly. If a specific field can't bind, keep a *minimal* flat shadow for just that field, not
the whole 40-key flat shape.

## Constraints that survive either way

- The numeric-knob bounds stay sourced from `generationKnobSchemas` (the one bounds object —
  the historic client/server bound-drift fix). Whatever the form validates with must spread those
  schemas, never re-type the bounds.
- The mapper currently preserves server-only fields the form never edits (`advanced`, `logitBias`,
  `stop`, `regexScripts`, `variables`, `customParameters`, `schemaVersion`) via merge-on-submit.
  A direct-bind editor must preserve them the same way (bind the whole config, or merge on submit).
- "Absent form field round-trips to unset" (the assignIfDefined discipline) must hold — an
  all-default `postProcess`/`reasoningParse` block round-trips to the field being omitted.
