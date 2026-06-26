# Orbweaver — `assets`: the content-addressed asset INDEX (split from the byte store)

> **Status: planning (target spec).** Ground-truth: whole-file recon of neo-tavern's
> `src/server/domain/assets/` (10 files, 633 lines), the byte store it splits against
> (`src/server/storage/` — `cas.ts`, `variant-cache.ts`, `zip-extract.ts`), the blob/upload HTTP
> routes (`src/server/http/assets.ts`), the addressing helpers (`src/shared/_kit/assets.ts`,
> `src/client/lib/assets.ts`), and `db/schema/assets.ts`. The defining design line: **the CAS
> *index* (the `assets` table + its verbs) is a domain; the raw byte read/write/hash-store is
> `infra/storage`** — keep the split clean. Authoritative upstream: `domains.md` §"assets" + the
> "assets vs infra/storage" open call; `_FANOUT-BRIEF.md` §2 (one-directional rule), §3 (placement
> rule), §4 (assets pain ledger), §7.3 (serde/PNG codec), §7.4/§7.5 (types/dispatch);
> `structure.md` §3 (server tiers), §4 (8-slot template), §6 (derived-data = event-driven indexer),
> §7 (the six gates); and `reports/shared-dissolution.md` §1/§4/§5 (the three-way split of
> `shared/_kit/assets.ts` — **cited, not re-derived**).

---

## What this domain owns

**The CAS index — the `assets` metadata table + the verbs that keep the blob↔row pair coherent.**
An asset is a content-addressed blob (sha-256 of its bytes = the CAS key) with one index row
recording `(id, kind, mime, size, hash, uploadedAt)`. **No `ownerId`** — assets are *global* and
**deduped by hash** (identical art across users is one blob, one row). The domain owns everything
about the *row* and the *coherence* between row and blob; the bytes themselves live in
`infra/storage`.

Specifically:

- **The CAS+row coherence primitive** — `storeBlob` (`persistence/queries.ts`): the **single**
  CAS-put + index-row-upsert path. The `store` verb and `backfillAvatars` both go through it, so the
  blob↔row invariant has exactly one writer. `enforceMagic` verifies the claimed mime against the
  byte signature at any user-upload boundary.
- **Index reads** — `assetIdForHash` (hash → AssetId) and `getMetadata` (hash → `{mime, size}`, the
  blob-serve gate).
- **Avatar backfill** — `backfillAvatars(ownerId, cards)`: workload-driven (re)link of staged card
  PNGs to characters' current versions; bulk-fetch + bounded-concurrency store + batched UPDATE;
  integrity-guards on `characters.importHash` mismatch.
- **Garbage collection + targeted reap** — `collectGarbage` (mark-sweep over the live avatar refs,
  grace-windowed) and `reapIfOrphan` (targeted, no grace; wired into `character.remove`). Both honor
  the **avatar-ref registry** and the **drop-row-before-blob** crash-safety ordering. No refcount
  column (would drift).
- **Integrity + disaster recovery** — `fsck` (read-only: dangling / corrupt / orphan report) and
  `rebuildFromTree` (re-derive index rows for orphan blobs by walking + hashing the tree).
- **The `assets` DB table** — all SELECT/INSERT/DELETE; `persistence/` is the only writer.
- **The avatar-ref registry** — the canonical list of columns that hold an asset id
  (`characterVersions.avatarAssetId`, `personas.avatarAssetId`). The single source both GC paths read.
- **Variant-sizing policy** — `BLOB_WIDTHS` + `snapBlobWidth` (the resize ladder that bounds the
  variant cache's keyspace). Domain policy, not a kit primitive — per `shared-dissolution.md` §5.
- **The magic-byte sniff** — `sniffMime` (pure; PNG/JPEG/GIF/WebP signatures).

This domain does **NOT** own:

- **The byte store** — `Cas` / `createCas` / `PutResult` and `VariantCache` / `createVariantCache`
  are `infra/storage`. Pure blob/derived-image I/O keyed by hash; imports only `@orb/kit` (the
  `isAssetHash` guard) + `node:*` + `atomically`/`sharp`. **NEVER imports `@orb/db`.** The domain
  consumes them as injected handles (a downward `domain → infra` dep).
- **Archive extraction** — `zip-extract.ts` (`extractZipToDir`, zip-bomb/zip-slip defenses) is
  `infra/storage` byte I/O serving the **import** flow, not assets.
- **The `/blob/<hash>` route contract** — `BLOB_ROUTE` + `blobUrl` are cross-boundary wire
  (`@orb/contracts/assets`); the client builds blob URLs, the server/caddy serves them.
- **The content-hash GUARD** — `isAssetHash` is a pure primitive (`@orb/kit/assets`); the CAS, the
  variant cache, and the blob route all guard on it.
- **The PNG card codec** — `isPng` / `readCardChunk` / `writeCardChunk` → `@orb/kit/png-card-chunk`
  (string-based, §7.3). Assets stores card PNGs as **opaque bytes**; chunk reading/writing is
  import/export's concern.
- **Image embeddings** — the image-embed pass already lives in `corpus` (→ `discovery`) /
  `embeddings`; `image_embeddings` is consumed only there. Assets **emits** `asset.created` and never
  imports embeddings/discovery (see §Cross-feature composition).
- **`forbidExternalMedia`** — confirmed a `character`/`settings` + message-render concern (governs
  whether external media URLs render in messages); it shares the word "media" but has nothing to do
  with the CAS. Excluded.

---

## The CAS index vs the byte store (the central split)

The one design question for this domain. Map every current unit to one side:

| Side | Tier | Holds | May import |
|---|---|---|---|
| **CAS index** | `domain/assets` | `assets` table + verbs; the coherence primitive (`storeBlob`); GC/reap/fsck/rebuild; the avatar-ref registry; variant-sizing policy; `sniffMime` | `@orb/db`, `@orb/kit`, `@orb/contracts`, **down** into `infra/storage` (the `Cas`/`VariantCache` handles) |
| **Byte store** | `infra/storage` | `cas.ts` (sharded `ab/cd/<hash>` blob I/O, atomic write, dedup, listHashes), `variant-cache.ts` (derived-webp cache), `zip-extract.ts` (archive I/O) | `@orb/kit` (`isAssetHash`), `node:*`, `atomically`/`fflate`/`sharp`. **NEVER `@orb/db`, NEVER a domain.** |

The blob is content; the row is metadata; the domain is **where they are kept coherent.** The single
chokepoint that proves the split: `storeBlob` calls `cas.putBytes(bytes)` (infra) then upserts the
`assets` row (db) — infra has no idea the row exists, the domain orchestrates both. `infra/storage`
is a sealed executor (the same rule as `connection`↔`providers`): the domain owns the *index +
policy*, infra owns the *bytes*.

---

## 8-slot layout

```
domain/assets/
├── index.ts            FRONT DOOR — re-exports AssetsService (interface), createAssetsService,
│                         and the domain-internal contract types (Backfill/Gc/Fsck/Reap results).
│                         StoredAsset + AssetKind come from @orb/contracts/assets (not re-exported).
├── service.ts          COMPOSITION ROOT — createAssetsService(db, cas, variants?). Spreads the four
│                         verb factories over one context. Zero logic.
├── context.ts          DI BUNDLE — { db, cas, variants?, assetIdForHash, storeBlob }. Explicit
│                         `export interface AssetsContext` (not ReturnType<>). `variants` OPTIONAL:
│                         callers that never delete blobs (DR rebuild) omit it.
├── contract/
│   ├── service.ts      interface AssetsService (7 verbs — the authoritative API listing)
│   ├── params.ts       BackfillCard · GcOptions (AssetKind imported from @orb/contracts/assets)
│   ├── results.ts      BackfillResult · GcResult · FsckResult · ReapResult
│   │                     (StoredAsset re-exported from @orb/contracts/assets — the upload wire result)
│   └── errors.ts       (NONE — deliberate: failures are plain Error; these are infra ops, not a
│                         tenant CRUD surface. Slot documented-empty, same as a feature with no views.)
├── verbs/
│   ├── store.ts        store (→ ctx.storeBlob) + getMetadata (the blob-serve gate)
│   ├── backfill.ts     backfillAvatars — bulk fetch + concurrency-8 store + db.batch UPDATE link
│   ├── gc.ts           collectGarbage (mark-sweep, grace-windowed) + reapIfOrphan (targeted, no grace)
│   └── fsck.ts         fsck (read-only integrity) + rebuildFromTree (DR)
├── persistence/
│   ├── queries.ts      assetIdForHash · storeBlob (the ONE CAS-put + row-upsert coherence primitive)
│   └── avatar-refs.ts  THE AVATAR-REF REGISTRY — { table, column } list of asset-bearing FKs
│                         (characterVersions.avatarAssetId, personas.avatarAssetId). Both GC paths
│                         iterate it. Lives in persistence/ (references @orb/db schema columns), same
│                         placement as tag's persistence/junctions.ts registry.
└── substrate/
    ├── mime.ts             sniffMime (pure magic-byte sniff; PNG/JPEG/GIF/WebP)
    └── variant-policy.ts   BLOB_WIDTHS + snapBlobWidth (the resize ladder; pure)
```

**Verbs (the `AssetsService` interface — 7 methods):**

```typescript
AssetsService = {
  // Persist + read (the coherence pair)
  store(bytes, kind, mime, opts?): Promise<StoredAsset>     // → storeBlob; enforceMagic at upload boundary
  getMetadata(hash): Promise<{ mime; size } | undefined>     // the /blob/:hash serve gate

  // Avatar backfill (workload-driven; ownerId-scoped char query)
  backfillAvatars(ownerId, cards: BackfillCard[]): Promise<BackfillResult>

  // Unreference-and-delete (both honor the avatar-ref registry + drop-row-before-blob)
  collectGarbage(options: GcOptions): Promise<GcResult>      // script-driven (assets:gc); mark-sweep
  reapIfOrphan(assetIds: AssetId[]): Promise<ReapResult>     // injected into character.remove; no grace

  // Integrity + disaster recovery
  fsck(): Promise<FsckResult>                                // read-only diagnose
  rebuildFromTree(kind: AssetKind): Promise<{ created; existing }>  // DR (assets:fsck --rebuild)
}
```

**`collectGarbage` vs `reapIfOrphan`:** mark-sweep over the *whole* CAS with a grace window
(guards racing imports) vs a *targeted* check of a known id set with no grace (the caller — 
`character.remove` — has just deleted a known set of references). They MUST stay distinct: reap
without grace is correct only because the caller proved the references are gone; collectGarbage
needs grace because an in-flight import may have stored a blob it hasn't linked yet.

---

## Public surface (`index.ts`)

```typescript
// Service contract + factory
export type { AssetsService } from "#domain/assets/contract/service";
export { createAssetsService } from "#domain/assets/service";

// Domain-internal result/param types (consumed by the CLI scripts + workload runners)
export type { BackfillCard, GcOptions } from "#domain/assets/contract/params";
export type { BackfillResult, FsckResult, GcResult, ReapResult }
  from "#domain/assets/contract/results";
```

**`StoredAsset` + `AssetKind`** live in `@orb/contracts/assets` (cross-boundary upload wire — see
§Movement); the domain imports them down and `contract/` re-exports `StoredAsset` for ergonomics.
They are NOT re-declared in the front door. **`BLOB_ROUTE` + `blobUrl`** are `@orb/contracts/assets`;
**`isAssetHash`** is `@orb/kit/assets` — neither is re-exported here.

The blob/upload routes (`entry/http/assets.ts`) import this front door (down from entry). The
workload runners (`assets-backfill`, `import-st`) and `character.remove` receive the service (or a
narrowed slice of it) as an **injected dep**, never a sideways domain import.

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `storage/cas.ts` — `Cas`, `createCas`, `PutResult`, sharded blob I/O, atomic write, dedup, `listHashes` | **→ `infra`** | `infra/storage/cas.ts` | The byte store. Pure filesystem adapter keyed by hash; imports only kit + node + `atomically`. The domain orchestrates it; it knows nothing of the index. `domain → infra` is a legal downward dep. | resolve-time: `infra/storage` may not import `@orb/db` (not in its consuming-direction) + dep-cruiser `infra-no-db` backstop |
| `storage/variant-cache.ts` — `VariantCache`, `createVariantCache` | **→ `infra`** | `infra/storage/variant-cache.ts` | Derived-image cache, sibling to the CAS; filesystem-only, reproducible-from-original. Imports only `isAssetHash`. | resolve-time (same infra/storage tier) |
| `storage/zip-extract.ts` — `extractZipToDir` (+ options/result) | **→ `infra`** (import flow) | `infra/storage/zip-extract.ts` | Archive byte I/O with zip-bomb/zip-slip defenses; serves **import**, not assets. Not an assets concern; listed here only because it's the third file in `storage/`. | resolve-time |
| `domain/assets/persistence/queries.ts` — `storeBlob`, `assetIdForHash` | **stays domain** | `domain/assets/persistence/queries.ts` | The CAS+row coherence primitive — the ONE writer of the blob↔row pair. DB upsert + a `cas.putBytes` call; pure index logic. | lint-time: dep-cruiser `assets-single-writer` — no `cas.putBytes` / `db.insert(assets)` outside this file (gate candidate) |
| `domain/assets/verbs/*` — store/getMetadata/backfill/gc/reap/fsck/rebuild | **stays domain** | `domain/assets/verbs/` | Business logic over the index; fits the 8-slot template; one owner. | compile-time: `AssetsService` interface lists all 7 |
| avatar-ref subqueries (inline in `verbs/gc.ts`, twice) | **stays domain, extracted** | `domain/assets/persistence/avatar-refs.ts` | Today the `characterVersions`/`personas` `.avatarAssetId` ref list is hardcoded in BOTH `collectGarbage` and `reapIfOrphan`. README flags it load-bearing: "adding a new avatar column MUST update both lists, or its blobs become silently GC-eligible." One registry, both verbs iterate it — same pattern as tag's junction registry. | compile-time: one typed `AvatarRef[]`; both verbs import it. test-time: a schema-introspection test asserts every `avatarAssetId`-typed FK column is in the registry (closes the "silently GC-eligible" gap) |
| `shared/_kit/assets.ts` — `isAssetHash` | **→ `kit`** | `@orb/kit/assets` | Pure hash guard (64-hex regex); zero I/O, zero domain; the path-traversal defense at every boundary. Per `shared-dissolution.md` §1. | resolve-time: `@orb/kit` is the universal leaf; CAS/variant-cache/route all import down |
| `shared/_kit/assets.ts` — `BLOB_ROUTE`, `blobUrl` | **→ `contracts`** | `@orb/contracts/assets` | The `/blob/<hash>` route contract — cross-boundary (client builds the URL, server/caddy serves it). Per `shared-dissolution.md` §1/§4. | resolve-time: client may import `@orb/contracts`, not `@orb/server` |
| `shared/_kit/assets.ts` — `BLOB_WIDTHS`, `snapBlobWidth` | **→ this domain** | `domain/assets/substrate/variant-policy.ts` | Variant-sizing POLICY, not a kit primitive — per `shared-dissolution.md` §5. Only the server blob route snaps (the client has its own `AVATAR_SIZES` ladder); no client consumer, so it stays domain-internal. The route (entry/http) imports it down. | resolve-time: `entry/` is above `domain/` (downward import OK) |
| `shared/_kit/assets.ts` — `AssetKind` (`"card"\|"avatar"\|"export"`) | **→ `@orb/contracts/assets`** (RESOLVED) | `@orb/contracts/assets` (`assetKindSchema` + inferred `AssetKind`) | The union is the upload **wire** `kind` field, re-spelled inline across 3 sites today (upload route validation, client `uploadAsset` helper, the `assets.kind` db enum). §7.5 → ONE canonical home in contracts; the db enum derives from the same tuple. `shared-dissolution.md` §5's "feature-internal → domain" line was CORRECTED 2026-06-25 → contracts (that table now agrees). | resolve-time (contracts importable by client + db + domain) + §7.5 `no-inline-union-redecl` |
| `domain/assets/contract/results.ts` — `StoredAsset` | **→ `contracts`** | `@orb/contracts/assets` | The upload POST response; the client hand-redeclares it as `UploadedAsset` (flagged in `_FANOUT-BRIEF.md` §8.2 "client hand-redeclares server zod — asset result"). Cross-boundary ⇒ contracts. The other results (Backfill/Gc/Fsck/Reap) are CLI/workload-only (no client) ⇒ stay domain. | resolve-time: client imports `StoredAsset` from contracts; domain `contract/` re-exports |
| `domain/assets/mime.ts` — `sniffMime` | **stays domain** | `domain/assets/substrate/mime.ts` | Pure isomorphic, but asset-specific and server-only (store `enforceMagic` + DR rebuild). Promote to `@orb/kit` only if the client ever needs to pre-sniff (deferred — see Resolved/deferred decisions). | lint-time: `kit-purity` would accept it; kept domain by intent |
| `http/assets.ts` — blob serve + upload registrars | **→ `entry`** | `entry/http/assets.ts` | Non-tRPC binary/multipart registrar (the `register<X>Routes` discipline). Calls DOWN: `assetsService` (domain), `cas`/`variants` (infra), `resolveOwner` (auth). | resolve-time: `entry/` is the topmost tier |
| `http/assets.ts` — the `?w=&f=webp` snap+variant-cache+sharp transform block | **split: policy → domain, sharp → infra** | new `domain/assets/verbs/resolve-variant.ts` injecting an `imageTransform` infra op (sharp) + the variant cache | Today the route inlines sharp. The width-snap is domain policy; sharp is CPU/I/O infra. A thin verb (snap → cache-read → transform-via-injected-op → cache-put) keeps the route thin and the policy in the domain. (Open decision — could stay in the route.) | resolve-time (sharp behind an infra adapter) + lint-time (no `sharp` import in `entry/` if extracted) |
| `_shared/ids.ts` — `newTypeId`; `shared/_kit/ids.ts` — `AssetId`, `castId`, `ID_PREFIX` | **→ `kit`** | `@orb/kit/ids` | Pure TypeID mint + brands; the canonical kit case (`shared-dissolution.md` §1, fanIn 446). | resolve-time |
| `_shared/audit.ts` — `logAudit` (used by GC/reap) | **→ `foundation`** | `foundation/observability/audit` | Audit sink; read-down-into by all. Per `shared-dissolution.md` §6. | resolve-time: `foundation` is below domain |
| `observability/logger.ts` — `getLog` | **→ `foundation`** | `foundation/observability/logger` | Logging seam. | resolve-time |
| `BatchItem<"sqlite">` inline casts (backfill `db.batch`) | **→ `@orb/db/kit`** | wire to `@orb/db/kit` `batchMany`/`batchStmt` | `_FANOUT-BRIEF.md` §8.4 flags inline `BatchItem` casts that bypass the existing batch helper. The non-empty-tuple spread in backfill is the same family. | compile-time: typed `db.batch` call via the db-kit helper |
| `errorMessage` (zip-extract) | **→ `kit`** | `@orb/kit/error-message` | Pure primitive. | resolve-time |

---

## Cross-feature composition (the injection model)

The assets domain is consumed by `character`, `workloads`, `import`, `entry`, and the CLI scripts.
None import `domain/assets` internals — all access is the front door or composition-root injection.

**Injected into `character.context` at the composition root (optional dep):**

| Op injected | Provided by | Used for |
|---|---|---|
| `assets.reapIfOrphan` | assets domain | `character.remove` / `bulk-remove` — targeted cleanup of the deleted character's exclusively-owned cards/avatars, without the full mark-sweep cost. Optional: tests/scripts omit it (the cascade still completes; the next `assets:gc` reclaims). |

**Injected into the `workloads` runner-env at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `assets.createAssetsService(db)` → a `WorkloadAssetsService` slice | assets domain | the `assets-backfill` + `import-st` runners build a per-job assets service and call `store` / `backfillAvatars` |

**Consumed down from `entry` (no injection — entry is above domain):**

| Consumer | Calls | Used for |
|---|---|---|
| `entry/http/assets.ts` (blob route) | `assets.getMetadata` + `cas`/`variants` + `snapBlobWidth` | gate + Content-Type + resized-webp serve of `/api/blob/:hash` |
| `entry/http/assets.ts` (upload route) | `assets.store(..., { enforceMagic: true })` | multipart ingest; auth + CSRF required |
| CLI scripts (`assets:gc`, `assets:fsck`) | `assets.collectGarbage` / `fsck` / `rebuildFromTree` | maintenance off the box |

**The asset → embeddings event seam (one-directional, NO sideways call):**

`domains.md` defines: avatar image → asset upload → **`asset.created`** → the `embeddings` indexer
embeds it (image lens, the one 1024-dim space). **Assets emits `asset.created`; it does NOT import
`embeddings` or `discovery`.** Today this is a whole-CAS scan workload (`embed-assets` runner →
`corpus.embedAndStoreImages`); the orbweaver target is the event-driven coalesced indexer
(`structure.md` §6, "import just works; no manual backfill scripts"). The `asset.created` payload is
a `@orb/contracts` event shape; `embeddings` subscribes. Assets having zero knowledge of who consumes
the event is the tell the split is right (mirrors `corpus`'s incest being removed).

---

## Spine thread intersections

### §7.1 Identity / auth / permission

Assets are **global, un-scoped, hash-deduped** — there is deliberately no `ownerId` on the `assets`
table. Access control happens at the **reference**, not the asset: a blob serve is gated on the
`assets` row *existing* (`getMetadata`), and the references that point at a blob ride owner-scoped
entities (`characterVersions`/`personas`, which carry `ownerId` on their parents). The blob route is
**intentionally unauthenticated** — the 64-hex hash is an opaque capability token (you can't
enumerate or path-traverse it; `isAssetHash` guards that), and the row's existence is the gate. The
**upload** route, by contrast, requires a resolved identity + CSRF (a mutating write). `backfillAvatars`
takes `ownerId` purely to scope the *character* query; under the `Principal` migration that argument
becomes `principal.userId`. There is no host/member hierarchy here — assets predate the permission
model and sit beneath it.

### §7.3 Serialization / serde core

Assets stores card PNGs as **opaque bytes**; it does not read or write the embedded card JSON chunk.
The PNG card codec (`isPng`/`readCardChunk`/`writeCardChunk`) is `@orb/kit/png-card-chunk`
(string-based, so it never imports the card type) and belongs to import/export. The load-bearing
intersection: **a card blob's CAS hash == `characters.importHash`** (both are the sha-256 of the whole
file). The CAS hash therefore doubles as the import idempotency key, and `backfillAvatars` uses it as
an integrity guard (`row.importHash !== stored.hash` ⇒ NOT linked, recorded as a mismatch). Any change
to the hash algorithm silently breaks importHash matching.

### §7.4 Types and schemas — one home, one direction

- `StoredAsset`, `AssetKind` → `@orb/contracts/assets` (cross-boundary upload wire — client redeclares
  both today; the db `assets.kind` enum derives from the same canonical schema, like tag).
- `BLOB_ROUTE`, `blobUrl` → `@orb/contracts/assets` (the route contract).
- `isAssetHash` → `@orb/kit/assets` (pure guard).
- `BackfillCard`, `GcOptions`, `BackfillResult`, `GcResult`, `FsckResult`, `ReapResult` →
  `domain/assets/contract/` (domain-internal; CLI/workload consumers only).
- `Cas`, `VariantCache`, `PutResult` → `infra/storage` (the infra adapter's own contract; server
  consumers import down — no client need, so NOT contracts despite the §8.2 "Cas 12 refs" flag).
- `AssetsContext` → `domain/assets/context.ts` top, explicit `export interface` (not `ReturnType<>`).
- `BLOB_WIDTHS`, `snapBlobWidth` → `domain/assets/substrate/variant-policy.ts` (domain policy).

### §7.5 String-union dispatch discipline

`AssetKind` (`"card" | "avatar" | "export"`) is a 3-member union spelled in **three** places today —
the db `assets.kind` enum (`db/schema/assets.ts:6`), the `shared/_kit/assets.ts` type, and inline in
both the upload route validation and the client `uploadAsset` helper. The §7.5 gold standard: ONE
importable `assetKindSchema` (zod) in `@orb/contracts/assets`, `AssetKind` inferred from it, the db
enum derived from the same tuple, the upload route validating against it, and the client importing it.
A new kind is added in exactly one place. (RESOLVED → `@orb/contracts/assets` — see §Movement.)

### §6 / structure.md §6 — derived data is event-driven

The image-embed pass was already moved OUT of assets (pre-2026-06) to `corpus/embed-images.ts`. The
orbweaver finish: the whole-CAS-scan workload (`embed-assets`) becomes the `asset.created` →
coalesced-embeddings-workload seam, so "import just works." Assets owns the *emit*, not the index.

---

## Esoteric / load-bearing details to preserve

1. **`isAssetHash` path-traversal guard** (`shared/_kit/assets.ts:12` → `@orb/kit/assets`): the
   `^[0-9a-f]{64}$` check is the security guard at every boundary that accepts an external hash —
   `cas.blobPath`, `variantCache.hashDir`, and the blob route all throw/404 on a non-hash, so a hash
   can never contain `/` or `..`. It must remain the guard, called *before* any path construction.

2. **The blob-width ladder bounds the variant keyspace** (`BLOB_WIDTHS` + `snapBlobWidth`): a fixed
   6-rung ladder means the variant cache stores at most `|BLOB_WIDTHS|` webp files per hash, not
   `2^31`. An attacker walking `?w=1..10000` can't fill the disk — every off-ladder ask snaps to a
   rung (and `?w=90`/`?w=96` share one cached variant). A DoS defense, not a nicety. The route 404s
   anything `snapBlobWidth` rejects.

3. **CAS dedup-by-hash + the mtime touch** (`cas.ts:108-126`): identical bytes hash identically; the
   second `putBytes` skips the write but **bumps the blob's mtime**. Without the touch, an in-flight
   import deduping onto an old orphan blob (delete-then-reimport of the same card) looks stale to
   `collectGarbage`'s mtime grace check and can be swept *between* the put and the row link. ENOENT
   on the touch means a concurrent GC just removed it → write fresh.

4. **`storeBlob` is the single coherence writer** (`persistence/queries.ts:22`): one CAS-put + one
   row-upsert, shared by `store` and `backfillAvatars`. The upsert uses
   `onConflictDoNothing({ target: assets.hash }).returning({ id })` — one round-trip on insert; on
   conflict, fall through to `assetIdForHash` (the comment notes this saved ~310 round-trips per
   import). A missing row after upsert throws (`row missing after upsert`).

5. **Mark-sweep GC with NO refcount column + drop-row-BEFORE-blob ordering** (`verbs/gc.ts`): GC is a
   mark-sweep over the live avatar refs; a refcount column would be a drift hazard. Both deletion
   paths delete the DB row *first*, then the blob, then `variants?.removeAll`. A crash between leaves
   a benign orphan blob (reclaimed by the next sweep), **never** a row pointing at a missing blob.
   Self-heal beats repair. The `biome-ignore no-await-db-in-loop` on the per-asset sequencing is
   deliberate — batching all rows then all blobs would widen the row-without-blob window.

6. **The avatar-ref registry is the silent-data-loss seam** (`verbs/gc.ts` → `persistence/avatar-refs.ts`):
   the set of columns that reference an asset (`characterVersions.avatarAssetId`,
   `personas.avatarAssetId`). Both GC paths read it. **Adding a new avatar-bearing column (NPC art,
   attachments) without updating the registry makes its blobs silently GC-eligible.** Extract to one
   typed registry + a coverage test (introspect the schema for asset FKs).

7. **`enforceMagic` at the upload boundary** (`storeBlob` + `http/assets.ts:134`): `sniffMime`
   verifies the claimed mime against the byte signature. Two *distinct* rejections kept legible —
   `octet-stream` (the "unrecognized signature" sentinel, never a valid claimed mime since we only
   serve PNG/JPEG/GIF/WebP) and claimed-vs-sniffed mismatch (a PNG renamed `.jpg`). Defends against a
   user smuggling an arbitrary binary (PHP, SVG-with-script) labeled `image/png`.

8. **CAS durability vs cache disposability** (`cas.ts` vs `variant-cache.ts`): the CAS writes a temp
   file *under rootDir* (same filesystem — a cross-device rename silently degrades to a non-atomic
   copy) → `fsync` → rename → explicit parent-dir fsync (POSIX durability; Windows best-effort). The
   variant cache is a CACHE — atomic rename (no torn reads) but **no fsync** (a lost entry is just a
   recompute). Preserve the asymmetry.

9. **`variants` is optional** (`context.ts`): DR rebuild and some workload envs omit it. Every path
   that removes an *original* also drops its cached resize variants — but only when `variants` is wired
   (`ctx.variants?.removeAll`).

10. **No `ownerId`, no custom error class** — deliberate. Assets are global+deduped; failures are plain
    `Error` (magic mismatch, missing-row-after-upsert) because the verbs are infra ops, not a tenant
    CRUD surface. The `contract/errors.ts` slot is documented-empty.

11. **zip-extract defenses (infra, not assets, but adjacent)**: declared-size + streamed-size caps
    (zip-bomb, including a lying header), a `{0,8}` compression allowlist, zip-slip path-escape
    rejection, serialized per-entry writes bounding peak memory to ~one entry. Lives in `infra/storage`,
    serves import.

---

## Invariants (gate candidates)

1. **The `assets` table has no `ownerId`; assets are global + hash-deduped.** Access control is at the
   reference, never the asset.
   *Enforcement: compile-time (schema has no `ownerId` column) + the blob route gates on row existence.*

2. **`storeBlob` is the only CAS-put + row-upsert site.** No verb calls `cas.putBytes` or
   `db.insert(assets)` outside `persistence/queries.ts`.
   *Enforcement: lint-time — dep-cruiser `assets-single-writer` (no `cas.putBytes`/`db.insert(assets)`
   outside `persistence/queries.ts`).*

3. **Drop-row-BEFORE-blob ordering in both deletion paths.** A crash mid-delete leaves an orphan blob,
   never a dangling row.
   *Enforcement: test-time — a crash-injection test asserts a mid-delete failure leaves a blob with no
   row (reclaimable), never a row with no blob.*

4. **The avatar-ref registry is the single source for "what references an asset."** Both
   `collectGarbage` and `reapIfOrphan` read it.
   *Enforcement: compile-time (one typed `AvatarRef[]`, both verbs import it) + test-time (schema
   introspection asserts every `avatarAssetId`-typed FK is in the registry — closes the silent-GC gap).*

5. **`infra/storage` (Cas / VariantCache / zip-extract) never imports `@orb/db` or a domain.** The byte
   store is a sealed executor below the domain.
   *Enforcement: resolve-time (db not in the consuming direction) + dep-cruiser `infra-no-db`/`infra-no-domain`.*

6. **`enforceMagic: true` at every user-upload boundary.** A mislabeled binary is rejected before it
   reaches CAS.
   *Enforcement: test-time — the upload route test asserts a non-image labeled `image/png` is rejected.*

7. **`isAssetHash` guards every path construction from an external hash.**
   *Enforcement: compile-time (`blobPath`/`hashDir` throw on a non-hash) + the guard lives in `@orb/kit`.*

8. **`AssetKind` has one canonical declaration.** The union lives in `@orb/contracts/assets` as
   `assetKindSchema`; the db enum, the upload route, and the client derive from it. (RESOLVED → contracts.)
   *Enforcement: §7.5 `no-inline-union-redecl` (count of re-spellings must be 1).*

9. **Assets emits `asset.created` but never imports `embeddings`/`discovery`.**
   *Enforcement: resolve-time (no dep) + dep-cruiser `domain-no-cross-feature`.*

10. **A card blob's CAS hash == `characters.importHash`** (both sha-256 of the whole file).
    *Enforcement: test-time (store a card PNG, assert `stored.hash === importHash`).*

---

## Resolved decisions (was: open)

- **`AssetKind` home — RESOLVED → `@orb/contracts/assets`** (`assetKindSchema` zod + inferred `AssetKind`;
  db enum derived from the same tuple). The union is the upload **wire** `kind` field re-spelled in 3
  places (db enum, route, client) — §7.5 → one contracts home, consistent with how `tag` handles
  `TagSource`. `shared-dissolution.md` §5's "feature-internal → domain" line was CORRECTED 2026-06-25 to
  contracts; no conflict remains.

- **`StoredAsset` home — RESOLVED → `@orb/contracts/assets`** (the upload POST response; the client
  redeclares it as `UploadedAsset` today, §8.2). The domain `contract/` re-exports it for ergonomics. The
  other results (Backfill/Gc/Fsck/Reap — CLI/workload-only, no client) stay domain-internal.

- **Blob-serve transform orchestration — RESOLVED: extract to a `resolve-variant` verb.** The `?w=&f=webp`
  snap+cache+sharp block becomes `domain/assets/verbs/resolve-variant.ts` injecting a `sharp` infra
  adapter — the width-snap is domain policy, `sharp` is infra I/O; keeps `entry/http` thin and `sharp` out
  of the entry tier. webp-only is by design (the client `avatarUrl` hardcodes `f=webp`); non-webp stays
  JIT. (Aligned with `transport.md`.)

- **`asset.created` event MECHANISM — RESOLVED (same pattern as import's emit).** Assets emits
  `asset.created` via an **injected `emit` op** on the `store` verb (the upload route's single coherence
  write), wired at the composition root; the payload shape lives in `@orb/contracts/events`. Assets has
  zero knowledge of subscribers. This replaces the whole-CAS-scan `embed-assets` runner.

### Still open (deferred, with criteria)

- **`asset.created` at-least-once delivery — DEFERRED (jointly with `embeddings`).** The emit MECHANISM
  is locked (above); the open piece is whether the bus is fire-and-forget in-process vs an outbox with
  at-least-once delivery to the coalesced embeddings workload. *Criterion:* matches whatever
  `embeddings.md` §events picks for the indexer bus shape (one decision for all `*.created`/`*.updated`
  events; the contracts event shape is the shared seam). Same deferral as import's `character.updated`.

- **`sniffMime` → `@orb/kit` — DEFERRED.** Pure isomorphic, but only server consumers today (store
  `enforceMagic` + DR rebuild). Stays `domain/assets/substrate/mime.ts`. *Criterion to promote to
  `@orb/kit/assets`:* iff the client ever needs to pre-sniff an upload before sending.

- **The `"export"` `AssetKind` value — DEFERRED: keep as scaffolded intent.** Declared but the
  export-blob path is a "future generated export." Keep it ("unwired ≠ worthless"). *Criterion:* confirm
  the export-blob write path is wired before any code relies on the `"export"` kind being produced.
