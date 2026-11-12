---
kind: adr
status: active
updated: 2026-11-12
---

# An asset kind belongs to each use of a stored file

## Context

D21 keeps one asset row per owner and content hash. The row carried one kind, so the first kind recorded for a file decided which readers found it: a picture first stored as a chat attachment and later uploaded as a background was absent from the background readers, and one later set as an avatar was never embedded. The owner ruled that a kind belongs to each use of a stored file, not to the file.

## Decision

`asset_kinds` in `packages/db/src/schema/assets.ts` holds one row for each kind an asset is used as, and `assets` has no kind column. `storeBlob` in `packages/server/src/domain/assets/persistence/queries.ts` records the kind of every store, so the same bytes stored under another kind add that use and keep the one row D21 requires. A reader that selects by kind asks `assetUsedAs` in `packages/db/src/query/asset-kinds.ts`, and a reader that reports kinds asks `loadAssetKinds` in the same file. The asset list, the asset reference and the portable file name carry every kind; a portable file that names one kind reads as an asset with that one use. A store that first records an embeddable kind for bytes already held emits `asset.created`, because the indexer skipped them before. Nothing removes a use while the asset lives. `tests/server/domain/assets/verbs/kind-per-use.int.test.ts` stores one picture under two kinds in both orders and reads it through each kind's reader.

## Consequences

The same picture is found whichever door stored it first. A kind is a statement of use, so it does not prove what the bytes are: `assertKindAdmits` still judges the bytes at each store, and `isPictureAsset` judges an avatar by its uses and its stored type. A removed use is not modelled: deleting a background entry leaves the asset a background until the asset itself is collected.

## Alternatives rejected

Keep one kind and let each reader ignore it: the kind-filtered asset list and the embeddable sweep would lose their meaning. Store a second asset row per kind: D21's one row per owner and hash is what every hash reader relies on. Keep the first kind as a column beside the use rows: two homes for one fact.
