# 1069 — assets-gc reference audit

Lane report for work item 1069, "assets-gc proves a blob unreferenced before deleting it".
Base: `c6eb3ba161`. Subject: the boot-seeded weekly `assets-gc` workload
(`packages/server/src/entry/boot/seed-cas-schedules.ts:31-34`) and its collector
`packages/server/src/domain/assets/persistence/asset-refs.ts`.

## How the GC decides

- The sweep reads ONE live set before it walks the CAS: `selectAllReferencedAssetIds`
  (`asset-refs.ts:468`), called from `collect-garbage.ts:78`.
- For each blob: kept if its `assets` row id is in the live set (`collect-garbage.ts:49-52`),
  kept if its mtime is inside the 1 h grace (`collect-garbage.ts:24`, `:53-56`), else purged.
- The purge (`substrate/purge-asset.ts:20-43`) deletes the row through
  `deleteAssetRowIfUnreferenced` (`asset-refs.ts:507`), whose liveness predicate sits in the same
  DELETE statement, then re-resolves `(owner, hash)` on both arms and removes the blob only when no
  row indexes it (`purge-asset.ts:29-42`).
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
| `user_settings` `$.appearance.backgroundAssetId` | settings section patch | yes | yes | `asset-refs.ts:226`, atomic `:507` | yes |
| `user_settings` `$.appearance.backgroundLibrary[].assetId` | settings section patch, ST import | yes | yes | `asset-refs.ts:190-224` | yes |
| `user_settings` `$.profile.avatarAssetId` | settings `profile` section patch; read live by `domain/persona/verbs/resolve-user-publics.ts:26` | **no** | yes | `asset-refs.ts:226`, atomic `:507` | yes (red, then green) |
| `characters.background_override` `$.assetId` (`kind:"asset"`) | `character.update` | yes | yes | `asset-refs.ts:265-315` | yes |
| `chats.metadata` `$.background.assetId` (`kind:"asset"`) | `chat.setChatBackground` | yes | yes | `asset-refs.ts:265-315` | yes |
| `asset:<id>` in `message_variants.content`, `raw_content`, `pre_continue_content`, `last_continuation_content` | turn, edit, duplicate, fork, import, engine | **no** (only through the `message_assets` link) | yes, on a row the asset's owner authored in a room they sit in | `asset-refs.ts:370-440`, atomic `:507` | yes: fork, duplicate, author edit (red, then green) |
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
   `asset:<id>` span. Scenario: attach an image in room A, fork A, delete A. The fork carries no
   `message_assets` link, so it does not render the image; the loss is on the model path, where
   `resolve-media-ref.ts:46` still resolves the body ref and sends the picture to the model. The
   body text is the only reference, and the next weekly sweep deletes the blob. Same for a
   duplicated message whose original is deleted. Fix: the collector reads `asset:<id>` refs from the
   four body columns, retaining an asset only on a row its OWNER authored in a room they sit in, in
   the snapshot and in the atomic delete.
2. **`profile.avatarAssetId`** — LOW (no UI writer today; reachable through the settings section
   API and read live as a member's room avatar). Fix: added to the settings source, snapshot and
   atomic.
3. **Fail-open shapes** — MEDIUM. A carried background with a source kind the build does not know,
   a library entry that is not an object or whose `assetId` is not a string, and a pick or profile
   avatar that is not a string were all silently read as "no reference". They now refuse the whole
   sweep with `asset_refs_unmeasurable` before any delete. The atomic predicate retains on any kind
   except the known non-asset kinds (`none`, `external`, retired `seeded`), so a kind written after
   the snapshot keeps the asset.

Leg 2, after the independent security review of `6c640765dd`. Each fix was red on that commit first:

4. **A co-member's quote kept the owner's deleted attachment (F1).** Body refs were filed under every
   seated human, so after host A deleted their attachment message, member X's quote of the same id
   kept the blob while A held a seat, and it kept riding to the model. A body ref now retains only on
   a row the asset's owner authored: the snapshot joins the author's own seat
   (`messages.author_user_id` = `chat_participants.user_id`) and the atomic delete adds
   `messages.author_user_id = owner`. Fork, duplicate and author edit keep the owner's own authorship,
   so they still retain.
5. **Containers were not checked (F3).** A non-object `$.appearance`, `$.profile`, room `$.background`
   or whole `background_override` (for example a double-encoded string) made every path beneath it
   read as absent. Every container on the way to a reference must now be an object, absent or a JSON
   null, and the config root and both carried roots are checked the same way.
6. **The refusal named no row (F4).** Every refusal now leads with the source row's table and primary
   key (`user_settings <userId> config`, `characters <id> background_override`,
   `chats <id> metadata`) and never a stored value. The snapshot reads JSON through `json_valid`, so a
   row whose text is not JSON is refused by name instead of failing the whole SELECT. The atomic
   delete still reads raw, so a row corrupted after the snapshot fails that purge closed.
7. **Unlink race in the purge (F5, predates 1069).** Between the row delete and `cas.remove`, a
   same-owner upload of the same bytes could dedup onto the still-present file, insert a fresh row
   and then lose its bytes. `purgeAsset` now re-resolves `(owner, hash)` after the row delete on both
   arms and skips the unlink when a row exists (`substrate/purge-asset.ts`).

## Fail-closed proof

`test.each` over eleven stored shapes no current writer produces (planted straight into the JSON
column, since the refusal path is what a writer cannot reach): each run ends `failed`, the error names
the broken row's primary key, and both the named asset and an unrelated aged orphan survive, so the
refusal deletes nothing. The malformed-JSON settings row was already fail-closed before the change, but
it named no row.

## Races and the grace window

| Case | Result | Evidence |
| - | - | - |
| Upload in flight (stored, not yet linked) | kept by the 1 h mtime grace | new suite, `inFlight` |
| Body ref written after the snapshot, while the asset-row DELETE is held | kept | new suite, held-db race test (red before) |
| Profile avatar written after the snapshot | kept | same test (red before) |
| Nothing written during the hold | deleted (positive control) | same test |
| Room background of an unknown kind written during the hold | kept; red when the atomic kind guard is reverted to `kind = 'asset'` | same test |
| Same-bytes upload indexed between the row delete and the unlink | its bytes survive | held re-check test (red before: the purge never re-checked) |
| FK and settings ref written while held | kept | legacy `collect-garbage.int.test.ts` (harness currently broken, see below) |

Residual races, not fixed:

- **R1, LOW.** Both purge arms now re-resolve `(owner, hash)` just before `cas.remove`. A same-bytes
  upload whose put dedups before the unlink but whose insert lands after that re-check still loses
  its bytes. No transaction spans the unlink; the window is milliseconds and the grace window covers
  the dedup bump. Documented in the file header.
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
- Cross-owner pinning: a body ref retains only on a row the asset's owner authored in a room they
  sit in. A stranger's quote and a co-member's quote pin nothing. Proven by scratch breaks, each red
  and then restored: dropping the snapshot's owner narrowing and the atomic owner join (leg 1, the
  stranger test), and dropping the atomic `author_user_id = owner` predicate (leg 2, the co-member
  test).
- No read grant changes: retention never grants rendering. The render paths keep their own gates.
- The JSON settings and carried-background sources keep their existing cross-user posture (owner
  ruling: accepted).
- Fail-closed is accepted (owner ruling); the row key in each refusal is its repair path. Error text
  names a table, a primary key, a JSON path and a JSON type, never stored values.
- `owner-scoped-reads` over its full population: 0 effective findings (raw 27 = waived 27). The new
  body-scan reads are UNKNOWN advisories, not findings, so they carry no waiver: a waiver there would
  bind to nothing.

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
