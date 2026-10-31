---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: embeddings
---

# A corrupt avatar blob counts as already up to date in the image sweep

## What

A truncated or corrupt stored image (a 5-byte blob in review) does not stop the image embedding sweep, but it is counted as skipped (already up to date) rather than failed, so the owner never learns the picture is broken. Found reviewing item 1457.

## Why

Item 1457's reason names corrupt or deleted files; a corrupt one still hides.

## Done when

A corrupt blob is reported as a failed asset with its id and shown to the owner like a missing one, pinned by a server integration test through the composed root.

## Evidence

A stored file whose bytes carry no known image signature threw nothing: the raw lens was a no-op in the text space and the analysis call failed into the skip shape, so the sweep counted it skipped. `loadAdmittedAsset` (`packages/server/src/domain/embeddings/indexer/image.ts`) now raises `AssetFileCorruptError` when the admission verdict is not `recognized`, and `embed-assets.ts` fails that asset like a missing file. Pinned by `tests/server/domain/embeddings/persistence/image-sweep-rows.int.test.ts` (a 5-byte blob stored through `assets.store`, swept through `embeddings.embedAssets`; red as `{ embedded: 1, skipped: 1 }`, green as `failedAssets: [id]`). The Jobs row names it through the failed-assets row, whose line now reads missing or unreadable.
