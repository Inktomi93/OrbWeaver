---
kind: spec
status: shipped
updated: 2026-07-10
---

# Assets — the maintenance/DR wave (PD-26 + PD-84): backfill · GC · reap · fsck · rebuild

> **Status: SHIPPED (2026-07-10).** The five verbs join `AssetsService`
> (`packages/server/src/domain/assets/verbs/{backfill-avatars,collect-garbage,reap-if-orphan,fsck,
> rebuild-from-tree}.ts`), over the asset-ref registry (`persistence/asset-refs.ts`) + the shared
> drop-row-before-blob primitive (`substrate/purge-asset.ts`). Wired: `character.remove`'s `reapAssets` →
> `assets.reapIfOrphan`; the workload runner-env → the real ops; two new BUILT workload kinds
> (`assets-gc`, `assets-fsck`, bulk-only, `stub:false`) + a `Cas.mtimeMs` accessor for the grace window.
> The code + its headers are the law now; this file is the as-built rationale.
>
> **AS-BUILT decisions (beyond the original draft):**
>
> - **Registry partition (data-integrity call).** The draft named 3 columns; the live schema has EIGHT
>   FK-to-`assets.id` columns. They are partitioned into RETAINING (7 — avatar/gallery/sprite/doc-source/
>   NPC/imagery, each pins its blob) and DERIVED (1 — `image_embeddings.asset_id`, regenerable, does NOT
>   pin). **`image_embeddings` MUST stay excluded** — every image asset has an embedding, so counting it
>   retaining would make reap/GC reclaim nothing. Ambiguous columns default to RETAINING (over-retaining
>   leaks a benign blob; under-retaining is silent data loss). The introspection test proves the partition
>   is TOTAL (every FK column is classified) — the structural close of the silent-GC gap.
> - **KNOWN LIMITATION:** chat-canon `asset:<id>` references live in message TEXT, not an FK column, so the
>   registry can't see them. Generated chat images carry an `imagery_generations` row (retained → safe); a
>   bare uploaded image pasted into a chat with no gallery/avatar/generation row is NOT — GC (a
>   grace-windowed, operator-triggered pass, never an automatic reaper) could reclaim it after grace.
>   Widening the registry to a canon-scan is a PD follow-up.
> - **CLI trigger:** GC/fsck run through the SAME workload/admin surface every other maintenance verb uses
>   (`assets-gc`/`assets-fsck` kinds) — no bespoke `assets:gc` CLI (off-pattern; import-st/reconcile-stats
>   have none either). `rebuildFromTree` (DR) stays a service verb for a recovery script.

## The five verbs (join `AssetsService` when the wave lands)

```typescript
backfillAvatars(ownerId, cards: BackfillCard[]): Promise<BackfillResult>
collectGarbage(options: GcOptions): Promise<GcResult>      // mark-sweep, grace-windowed
reapIfOrphan(assetIds: AssetId[]): Promise<ReapResult>     // targeted, NO grace
fsck(): Promise<FsckResult>                                // read-only integrity report
rebuildFromTree(kind: AssetKind): Promise<{ created; existing }>  // DR (PD-84)
```

Their param/result types (`BackfillCard`, `GcOptions`, `BackfillResult`, `GcResult`, `FsckResult`,
`ReapResult`) are domain-internal `contract/` types (CLI/workload consumers only — no client, so NOT
`@orb/contracts`). They join the front door with the verbs.

## `collectGarbage` vs `reapIfOrphan` — MUST stay distinct

- **`collectGarbage`** — mark-sweep over the whole per-user CAS against the live reference set, with a
  **grace window** (mtime-based): an in-flight import may have stored a blob it hasn't linked yet;
  grace guards the put→link gap. Script/workload-driven (`assets:gc`).
- **`reapIfOrphan`** — a targeted check of a known id set with **no grace**: correct only because the
  caller (`character.remove` / bulk-remove) has just deleted a known set of references and proved
  they're gone.
- The built CAS half of this contract already exists: dedup `putBytes` **bumps the blob's mtime** to
  the injected `now` precisely so GC's grace window also protects deduped re-imports (documented in
  `infra/storage/cas.ts` — a delete-then-reimport of the same card must not be swept between the put
  and the row link; ENOENT on the touch means a concurrent GC removed it → write fresh).

## Deletion invariants (both paths)

1. **Drop-row-BEFORE-blob ordering.** Delete the `assets` row first, then `cas.remove`, then
   `variants?.removeAll` (only when `variants` is wired — the handle is optional). A crash mid-delete
   leaves a benign orphan blob (reclaimed by the next sweep), **never** a row pointing at a missing
   blob. Self-heal beats repair. Per-asset sequencing is deliberate (a `biome-ignore
   no-await-db-in-loop` candidate) — batching all rows then all blobs would widen the
   row-without-blob window.
2. **No refcount column** — it would drift; mark-sweep over the reference registry is the truth.
3. Test-time: a crash-injection test asserts a mid-delete failure leaves a blob with no row, never a
   row with no blob.

## The asset-ref registry — the silent-data-loss seam

`persistence/avatar-refs.ts` (name it `asset-refs.ts` now): the ONE typed `{ table, column }` list of
every column that holds an `AssetId`, which BOTH GC paths iterate. Today that set is at least
`characters.avatarAssetId`, `personas.avatarAssetId`, **and `gallery_items.assetId`** (gallery landed
after the original spec; a curated item must pin its blob). **Adding a new asset-bearing column (NPC
art, attachments, sprites — see D21's `character_sprites` amendment) without updating the registry
makes its blobs silently GC-eligible.** Same placement pattern as tag's `persistence/junctions.ts`
registry.

- Compile-time: one typed `AssetRef[]`, both verbs import it.
- Test-time: a schema-introspection test asserts every asset-FK column in `@orb/db` schema is in the
  registry (closes the silent-GC gap structurally, not by convention).

## `backfillAvatars`

Workload-driven (re)link of staged card PNGs to the flat `characters` row (D28 — no version table):
bulk-fetch + bounded-concurrency store (concurrency \~8) + batched UPDATE via the `@orb/db/kit` batch
helpers (no inline `BatchItem` casts). Integrity guard: `row.importHash !== stored.hash` ⇒ NOT
linked, recorded as a mismatch (`importHash` is the whole-file sha-256 on the flat row — the same
value as the card blob's CAS hash — and is distinct from `contentHash`, the semantic-fields hash).
Goes through `storeBlob` (the single coherence writer — the `assets-single-writer` dep-cruiser rule
already enforces this).

## `fsck` + `rebuildFromTree` (PD-84)

- `fsck` — read-only: dangling rows (row, no blob), corrupt blobs (`cas.verify` re-hash mismatch),
  orphan blobs (blob, no row). The `cas.verify`/`listHashes` infra surface already exists.
- `rebuildFromTree` — disaster recovery: re-derive index rows for orphan blobs by walking + hashing
  the per-user tree; `sniffMime` supplies a best-effort mime (its second declared caller). This is
  also the reliability backstop for the `store` emit's orphan-blob edge flagged FLAG\[PD-84] in
  `verbs/store.ts` (a rebuilt row was never `asset.created`-emitted; the embeddings `content_hash`
  catch-up sweep — PD-53, built — covers the vectors).

## Wiring (the seams are already declared, inert)

| Seam | Where it exists today | The wave fills it with |
| - | - | - |
| `character.remove` targeted cleanup | `reapAssets: () => Promise.resolve()` (INERT, flagged) at `entry/compose/services.ts` | `assets.reapIfOrphan` (optional dep — omitting it just defers to the next sweep) |
| workloads runner-env | `runner-env.ts` `assets.* → notBuilt("…PD-26")`; `assets-backfill` runner + test exist | real bound ops (`backfillAvatars` / `collectGarbage` / `fsck`) |
| workload kinds | only `assets-backfill` declared | GC/fsck get their own kinds |
| CLI / ops entry (`assets:gc`, `assets:fsck --rebuild`) | none | script or admin ops surface (the PD-26 build trigger: blob-store growth OR an ops/maintenance admin surface landing) |

## Adjacent, NOT this wave

- **`store` `maxBytes` bound** — PD-94, blocked on the PD-77 zip loader (the zip-bomb belt must land
  with the loader). Zip-extract itself is `infra/storage` design, spec'd in `core/Tier-3-Infra.md`
  (§archive extractor).
- **`asset.created` delivery** — resolved (PD-27): in-process fire-and-forget for v1.
