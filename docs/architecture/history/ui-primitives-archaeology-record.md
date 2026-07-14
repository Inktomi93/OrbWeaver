---
kind: history
status: active
updated: 2026-07-13
---

# UI-Primitives archaeology record

> **Frozen 2026-07-13, extracted from `core/UI-Primitives-and-Reuse.md`.** The reuse-decision provenance, the superseded/landed component sagas, and the born-compliant sequencing history that used to sit inside the §13 law. It is ARCHIVE, not law — the live rules live in `core/UI-Primitives-and-Reuse.md` §13 and in the code. Do not work from this file; git history is the finer archaeology.

## Doc lineage

The §13 reuse-model law began as part of a nine-doc UI set split from the D42 spec (pre-split source: a now-deleted `client.md`). Its synthesis drew on the full client-foundation research sweep — the five `UI-Lib-*` companions (`history/UI-Lib-TanStack-{Query,Form,Router,Virtual}.md` · `history/UI-Lib-Zustand.md`), re-homed to `history/` on 2026-07-09 as evidence/provenance mines (their distilled verdicts were folded into the spec sections). The §13.7–§13.9 structural contract graduated into the core doc from a `proposed/ui-primitive-contract.md` that was deleted on graduation. `Status: authoritative` was stamped D54 (2026-06-29).

## Sequencing — the born-compliant client-foundation wave

Every §13.1 client primitive and the §13.3 client belts shipped in the client-foundation wave, ahead of the feature lanes (§11.7). The `@orb/ui` half shipped earlier still, gates included. The rule this sequencing protected survives as live law (§13.6): a surface not using its primitive is the review flag. neo rotted in the gap between "feature shipped" and "gate written" — the whole architecture exists to close that gap, so the primitives + their gates were built together, before any feature agent ran.

## The Form under-use correction (the neo framing it replaced)

neo framed TanStack Form as "the 4 entity editors," which under-used it: settings, connections, group config, theme, and user-admin are all multi-field forms that belong in a factory. The connection add+edit form was hand-rolled in neo before the factory landed. The live correction is §13.4: Form is for any ≥3-field / validation / save-or-draft surface, not just "entities."

## Obligation-5 doctrine — codification trail

The crash-mirror draft slot doctrine (§13.4) was codified 2026-07-09 from the shipped consumers' own reasoning. The autosave stance ("the server row IS the crash mirror, so the `draft` slot is omitted") came from the `use-appearance-form` / `use-persona-form` precedent. The saved-form stance was AMENDED that day: the original "unsaved state lives in the form itself" ruling gained an OPTIONAL `draft` crash mirror on `createSavedEntityForm` (shipped 2026-07-09), for long-form editors whose fields carry authored text — the character card editor is the founding consumer.

## D62 primitive-delta landing list

Specced in `ux-flow-revamp.md` §4 (the delta list's origin, now in `history/`), the D62 primitive deltas all landed under the §13.7 contract + §13.8 rules — the code + `tokens.json` are now the doc:

- new `kbd` primitive
- `Text` gained `micro` size + `caps` transform
- `Avatar` sizes decoupled from control tokens (new avatar-size token trio `avatar-sm/md/lg` + `avatar-hero`) + deterministic per-entity fallback hue
- `Dialog` gained width variants (`sm/md/lg/xl`) + a `full` presentation
- `EmptyState` gained `action` + `decoration` slots
- `Skeleton` gained the reduced-motion-safe shimmer sweep
- `Button` `secondary` retuned to bordered (D62 P5); `ghost` defaults muted
