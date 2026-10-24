---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: import
---

# A restore into a fresh box reports every seeded asset as a failure

## What

A full library restore into a fresh box that has signed in once reports one failed file per asset the first-login seed already stored (plates, avatars, plugin blobs; 29 in a composed reproduction), each refused by the asset import's fourth check in `packages/server/src/domain/assets/verbs/import-asset.ts` with "already in this library under a different id, needs an id remap". The check is ruled: import has no cross-file channel, so remapping an id would leave other referrers dangling. Settings now resolve backgrounds by content hash and card art travels inside the PNG, but chat attachments, gallery entries and room backgrounds still refer to assets by id.

## Why

A clean restore that reads as dozens of failures teaches the user to distrust the report, and the real failures hide among them.

## Done when

Owner ruling recorded here on the fork: either the check answers success with a note when the same owner already holds those exact bytes, once every referrer resolves by hash or seeded identity (chat attachments, gallery, room backgrounds move onto hash or seeded identity first), or the import builds the old-to-new id remap the check's header names; a fresh-box round trip then reports zero failures with no reference left dangling, proven by the composed round trip in `tests/server/domain/import/loader/import-bundle.int.test.ts`.

## Owner ruling

2026-10-24: hash identity, not an id remap. Chat attachments, gallery entries and room backgrounds move onto content-hash or seeded identity first; the asset import's fourth check then answers success with a note when the same owner already holds those exact bytes. Import keeps no cross-file channel.

## Evidence

Proven by the composed round trip in `tests/server/domain/import/loader/import-bundle.int.test.ts` ("a full library restore into a fresh box reports no failures and leaves no reference dangling"). The source box curates a seeded plate into its gallery and seeds a room painted with that plate, carrying the same plate as an inline attachment; the whole library restores into a fresh signed-in box. Before the change the restore reported 30 failures (29 seeded assets and the room, refused because its background named a missing asset), the room did not land, and the curated plate was missing from the target's gallery. After it: zero failures, the room's background and its attachment resolve to the plate's bytes (the attachment through the room's render grant), and the target's gallery holds the same images as the source's.

Each referrer now carries the content hash and re-links by it at import, as settings backgrounds already did. The in-box columns keep their asset-id foreign keys, so no schema change or migration was needed:

- Gallery entries: the `orb.gallery` row carries `assetHash` beside `assetId`; the import resolves the owner's asset by hash, then by the carried id. A file without the hash restores by id as before.
- Room backgrounds: `chats.metadata.background` already carried `assetHash`; the chat bundle import re-points `assetId` to the owner's asset with those bytes.
- Chat attachments: the chat bundle carries `assetHashes`, the content hash of each exporter-owned asset an inline image names; the import rewrites each `asset:<id>` image ref through `relinkContentAssets` (`packages/kit/src/content/index.ts`), so the rebuilt `message_assets` link names a real asset.

The asset import's fourth check (`packages/server/src/domain/assets/verbs/import-asset.ts`) answers `{ ok: true, created: false }` with a note naming both ids when the owner already holds the bytes.

Databank documents (`sourceAssetId`) and imagery generations still restore by the carried id. On a fresh box they name no seeded bytes, so nothing dangles there.
