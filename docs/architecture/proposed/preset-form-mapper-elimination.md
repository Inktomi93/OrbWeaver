# Proposed: eliminate `PresetFormValues` + the flat-form mapper (client preset editor)

> **Status: proposed / unbuilt.** Salvaged from the gutted `domains/preset.md` movement table
> (the one DEFERRED row). Everything else in that doc is carried by the code; this is the one
> genuinely-open design decision, and it can only be decided when the client preset editor is built.

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
