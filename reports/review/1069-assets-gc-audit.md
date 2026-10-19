# 1069 — assets-gc reference audit

Lane report for work item 1069 (`docs/work/1069-assets-gc-proves-a-blob-unreferenced-before-deleting.md`).
Base: `c6eb3ba161`. Subject: the boot-seeded weekly `assets-gc` workload
(`packages/server/src/entry/boot/seed-cas-schedules.ts:31-34`) and its collector
`packages/server/src/domain/assets/persistence/asset-refs.ts`.

## How the GC decides

- The sweep reads ONE live set before it walks the CAS: `selectAllReferencedAssetIds`
  (`asset-refs.ts:426`), called from `collect-garbage.ts:78`.
- For each blob: kept if its `assets` row id is in the live set (`collect-garbage.ts:49-52`),
  kept if its mtime is inside the 1 h grace (`collect-garbage.ts:24`, `:53-56`), else purged.
- The purge (`substrate/purge-asset.ts:20-47`) deletes the row through
  `deleteAssetRowIfUnreferenced` (`asset-refs.ts:465`), whose liveness predicate sits in the same
  DELETE statement, then removes the blob. A blob with no row re-resolves `(owner, hash)` first
  (`purge-asset.ts:33-43`).
- `reapIfOrphan` (no grace, character remove and plugin install/upgrade/uninstall) uses the same
  live set and the same atomic delete (`verbs/reap-if-orphan.ts:62`, `:72`).

## Reference matrix

Counts: `references(() => assets.id` in `packages/db/src/schema` = 13 by `rg -c` and 13 by
`ast-grep` (`$C.references(() => assets.id, $$$)`), over 32 schema files. `$type<AssetId>()`
= 14 = those 13 plus `assets.id` itself, so no AssetId-typed column lacks its FK.

| Reference source | Where it is written | Consulted before | Consulted now | Code | Planted in the new suite |
| - | - | - | - | - | - |
| `characters.avatar_asset_id` | `schema/character.ts:131` | yes | yes | `asset-refs.ts:39` | yes, `character.create` |
| `personas.avatar_asset_id` | `schema/persona.ts:37` | yes | yes | `asset-refs.ts:40` | yes, `persona.create` |
| `gallery_items.asset_id` | `schema/gallery.ts:25` | yes | yes | `asset-refs.ts:41` | yes, `assets.addToGallery` |
| `imagery_generations.asset_id` | `schema/imagery.ts:46` | yes | yes | `asset-refs.ts:43` | yes, `imagery.generatePicture` on a scripted image wire |
| `message_assets.asset_id` | `schema/chat.ts:614` | yes | yes | `asset-refs.ts:44` | yes, `chat.commitMessage` with an attachment |
| `message_reactions.emoji_image_asset_id` | `schema/chat.ts:788` | yes | yes | `asset-refs.ts:50` | no: no production writer (the reaction wire is unicode-only) |
| `documents.source_asset_id` | `schema/databank.ts:51` | yes | yes | `asset-refs.ts:53` | yes, `databank.upload` |
| `plugins.bundle_asset_id` | `schema/plugin.ts:45` | yes | yes | `asset-refs.ts:55` | yes, `plugin.install` |
| `admin_distributed_plugins.bundle_asset_id` | `schema/plugin.ts:165` | yes | yes | `asset-refs.ts:61` | yes, `plugin.installForAllUsers` then the publisher's own uninstall |
| `plugin_assets.asset_id` (bundle image and `net.fetchAsset`) | `schema/plugin.ts:241` | yes | yes | `asset-refs.ts:68` | yes, both arms |
| `image_embeddings` / `image_index_skips` / `image_analyses` `.asset_id` | `schema/embeddings.ts:243,282,541` | derived (non-retaining) | derived | `asset-refs.ts:80` | no: regenerable by design |
| `user_settings` `$.appearance.backgroundAssetId` | settings section patch | yes | yes | `asset-refs.ts:191`, atomic `:465` | yes |
| `user_settings` `$.appearance.backgroundLibrary[].assetId` | settings section patch, ST import | yes | yes | `asset-refs.ts:155-189` | yes |
| `user_settings` `$.profile.avatarAssetId` | settings `profile` section patch; read live by `domain/persona/verbs/resolve-user-publics.ts:26` | **no** | yes | `asset-refs.ts:191`, atomic `:465` | yes (red, then green) |
| `characters.background_override` `$.assetId` (`kind:"asset"`) | `character.update` | yes | yes | `asset-refs.ts:231-264` | yes |
| `chats.metadata` `$.background.assetId` (`kind:"asset"`) | `chat.setChatBackground` | yes | yes | `asset-refs.ts:231-264` | yes |
| `asset:<id>` in `message_variants.content`, `raw_content`, `pre_continue_content`, `last_continuation_content` | turn, edit, duplicate, fork, import, engine | **no** (only through the `message_assets` link) | yes, for the asset's owner seated in that room | `asset-refs.ts:317-400`, atomic `:465` | yes: fork, duplicate, author edit (red, then green) |
| `message_variants.metadata` `contentSignatures.images[].assetId` | engine replay provenance | no | no | — | no: the same ids sit in `content` |
| `themes.css` `url(/api/blob/<hash>)` | user-authored CSS only | no | no | — | no: no product writer emits a blob URL; hand-typed text |
| `characters.import_hash`, `documents.import_hash`, `chats.import_hash`, `imagery_generations.import_hash` | importers | n/a | n/a | — | not CAS references: identity and dedup hashes (`primitives/serde/card/index.ts:405`) |

Files under the data dir:

| Location | GC behavior | Code |
| - | - | - |
| CAS blobs `assets/<owner>/<ab>/<cd>/<hash>` | the only tree GC walks | `infra/storage/cas.ts:75-104` |
| CAS write staging `assets/.tmp` | never walked: `.` fails the owner-segment pattern | `cas.ts:41-42`, `:97-103` |
| A non-hash file under an owner dir | ignored | `cas.ts:75-80` |
| Variant cache | derived; removed with its blob | `purge-asset.ts:45` |
| `cache/import-staging`, `users/`, `backups/`, `reports/` | never touched by GC | — |

## Misses found and fixed

Every miss below was red on the unmodified collector through the real `assets-gc` workload on
the composition root (`tests/server/domain/assets/verbs/collect-garbage.int.test.ts`):

1. **Message-body refs with no `message_assets` link** — HIGH, data loss. `forkChat` copies the
   canon body (`domain/chat/verbs/fork.ts`, `buildCanonCopy`) but writes no `message_assets` row;
   `duplicateMessage` copies the selected body the same way; an author's edit can add an
   `asset:<id>` span. Scenario: attach an image in room A, fork A, delete A. The fork still shows
   the image, its only reference is the body text, and the next weekly sweep deletes the blob. Same
   for a duplicated message whose original is deleted. Fix: the collector reads `asset:<id>` refs
   from the four body columns, retaining an asset only where its OWNER sits in that room, in the
   snapshot and in the atomic delete.
2. **`profile.avatarAssetId`** — LOW (no UI writer today; reachable through the settings section
   API and read live as a member's room avatar). Fix: added to the settings source, snapshot and
   atomic.
3. **Fail-open shapes** — MEDIUM. A carried background with a source kind the build does not know,
   a library entry that is not an object or whose `assetId` is not a string, and a pick or profile
   avatar that is not a string were all silently read as "no reference". They now refuse the whole
   sweep with `asset_refs_unmeasurable` before any delete. The atomic predicate retains on any kind
   except the known non-asset kinds (`none`, `external`, retired `seeded`), so a kind written after
   the snapshot keeps the asset.

## Fail-closed proof

`test.each` over seven stored shapes no current writer produces (planted straight into the JSON
column, since the refusal path is what a writer cannot reach): each run ends `failed`, and both the
named asset and an unrelated aged orphan survive, so the refusal deletes nothing. Each failure was
confirmed to carry the collector's own refusal message. The malformed-JSON settings row was already
fail-closed before the change (SQLite raises on `json_extract`); it is the control.

## Races and the grace window

| Case | Result | Evidence |
| - | - | - |
| Upload in flight (stored, not yet linked) | kept by the 1 h mtime grace | new suite, `inFlight` |
| Body ref written after the snapshot, while the asset-row DELETE is held | kept | new suite, held-db race test (red before) |
| Profile avatar written after the snapshot | kept | same test (red before) |
| Nothing written during the hold | deleted (positive control) | same test |
| FK and settings ref written while held | kept | legacy `collect-garbage.int.test.ts` (harness currently broken, see below) |

Residual races, not fixed:

- **R1, LOW.** A blob with no row (only after a crash between put and insert) is re-resolved and
  then unlinked (`purge-asset.ts:33-44`). A re-upload of byte-identical content that indexes a row
  between that query and `cas.remove` leaves a row with no blob. No transaction spans the unlink;
  the window is milliseconds and needs a crash orphan first. Documented in the file header.
- **R2, MEDIUM, import lane.** `import-bundle` restores blobs first and links them later. The
  single-active lock is per kind (`domain/workloads/persistence/constraints.ts`), so a weekly GC can
  run during an import. An import longer than the 1 h grace loses blobs whose referencing rows have
  not landed yet. Fix belongs to the import/export lane: the GC skips while an import workload is
  active, or the importer re-stamps restored blobs as it links them.
- **R3, LOW.** A store that dedups onto an old unreferenced row after GC passed its grace check
  loses the row; the caller's later link insert fails on the enforced FK, so the user sees an error
  rather than silent loss.

## Security self-review

- Authority: unchanged. The sweep is the trusted system pass (D20); no principal reaches it.
- Cross-owner pinning: a body ref retains only the asset owned by a human seated in that room. A
  stranger quoting another owner's asset id pins nothing. Proven by breaking it twice in a scratch
  run: dropping the snapshot's owner narrowing, then dropping the atomic predicate's owner join;
  each made the cross-owner test red, and both were restored.
- No read grant changes: retention never grants rendering. The render paths keep their own gates.
- The JSON settings and carried-background sources keep their existing cross-user posture.
- Error text names a JSON path and a JSON type only, never stored values.

## Follow-ups for the board

1. **Fork and duplicate drop the `message_assets` link.** What: `forkChat` and `duplicateMessage`
   copy bodies but no link rows. Why: co-participants lose the room render grant for the copy, and
   an inline-reply picture loses its wire-history replay. Done: both copy the links for the copied
   slots, under the fork strip posture, with a test per verb.
2. **Export walks inline refs twice.** What: `verbs/export-assets.ts:61-65` and
   `persistence/portable-refs.ts` scan bodies the collector now covers. Why: one home per concept.
   Done: the export uses the collector alone and the duplicate scan is deleted (import/export lane).
3. **GC during a long import (R2).** Done: an import overlapping a sweep loses no restored blob,
   with a test.
4. **Legacy assets harness is broken.** `tests/legacy/server/domain/assets/_support.ts:104` throws
   "database wiring handle is not registered", so every legacy assets suite fails at setup on the
   base commit too.
