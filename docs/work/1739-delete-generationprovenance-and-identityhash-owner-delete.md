---
kind: work
status: open
updated: 2026-11-01
priority: P3
area: server
plan: unwired-code
---

# Delete GenerationProvenance and identityHash (owner: delete)

## What

Delete only the `identityHash` field on the `GenerationProvenance` view, and the free-mode passthrough: the optional request `identityHash` on `GeneratePictureParams` and `provenanceHash` in `packages/server/src/domain/imagery/verbs/generate-picture.ts`.

Keep `GenerationProvenance` itself and the stored `imagery_generations.identity_hash` column.

## Why

`GenerationProvenance` is live: the gallery provenance strip reads it. The stored `identity_hash` drives portrait reuse and the strict portable bundle. No caller sets the request field or reads the view field.

## Done when

- `readProvenance` returns no `identityHash`, and `generationProvenanceSchema` has no such key.
- `GeneratePictureParams` has no `identityHash`.
- The reuse gate and the portable bundle still read and write `identity_hash`.

## Evidence

- `tests/support/node/corpus-image-variants.int.test.ts`
- `tests/support/node/factories/imagery-view.test.ts`
- `tests/server/domain/imagery`
