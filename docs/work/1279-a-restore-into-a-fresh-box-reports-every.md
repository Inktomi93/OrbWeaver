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

## Evidence

Filled at landing: what ran and where its output is.
