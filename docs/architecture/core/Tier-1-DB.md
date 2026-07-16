---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — `@orb/db`: the schema floor (drizzle + libSQL + migrations)

`@orb/db` is the third tier of the cake (`kit ← contracts ← db ← server ← client`): the drizzle schema, the libSQL client + PRAGMAs + migration runner, the native vector column type, and the db-layer primitives that need drizzle types. It sits below `server` (its only business-logic consumer) and above `contracts` + `kit` (it imports TypeID brands from `@orb/kit/ids` and enum tuples from `@orb/contracts`). The DB row types (`$inferSelect`/`$inferInsert`) are produced HERE; every domain imports them downward. The per-table design law lives in the schema files' own header comments (the code is the doc); this file carries only the cross-cutting db law.

## What this package owns

- **The drizzle schema** — every `sqliteTable`, one file per **producing** domain (`schema/<feature>.ts`) plus the reserved cross-cutting set (`users` · `audit` · `agent-principals` · `relations`; `custom-types/` is its own top-level dir, not a schema file). `schema/index.ts` is the source-of-truth barrel; the `db-structure` gate enforces the domain split AND the re-export (a file missing from the barrel silently drops its tables from `typeof schema` and migrations).
- **The DB row types** — `$inferSelect`/`$inferInsert` (the §7.4 DB-row home). The TypeID brand lives AT the column (`$type<CharacterId>()`), so rows come back branded with no `castId` at the row→view seam.
- **The libSQL client + lifecycle** (`client/`) — `createDb(url, wrap?)`, the per-connection PRAGMA block, `runMigrations`, `assertReferentialIntegrity`, `backupBeforeMigrate`, `optimizeDb`, `preCloseHousekeeping`, and the `LibSqlWrap` injection seam (the OTel wrapper is passed IN from `foundation/observability` because `db` can't import `server`).
- **The migrations** — the fresh `0000_baseline.sql` + `meta/_journal.json` (born with every ledger decision already applied — no cv-pin, no `chats.ownerId`, `content_hash` on all five vector tables (character\_embeddings · image\_embeddings · chat\_digests · chat\_segments · document\_chunks), …).
- **The native vector column** (`custom-types/`) — `vector32` (libSQL `F32_BLOB(dim)`, raw little-endian Float32 blob), consumed by `schema/embeddings.ts` + `schema/discovery.ts` (the k-means `centroid`).
- **`@orb/db/kit`** — db-layer primitives that need drizzle types and cannot be kit-pure: `batch`, `db-errors` (the deep cause-walk constraint classifier), `fetch-owned` (`fetchOwned`/`OwnedTable`), `insert-chunk` (the libSQL 32766 bound-variable cap), `parsers` (the read-seam zod `.catch(null)` JSON-column coercion; the deliberate `null`-vs-`[]` contract asymmetry is load-bearing).

NOT owned: business logic (verbs/ownership/dispatch → `server`); the vector write path + `VECTOR_TABLES`/`clearVectorTable` (→ `domain/embeddings`, the table owner); the OTel wrap impl (injected); audit-log WRITES (`logAudit` → `foundation/observability`; the table stays here); pure-isomorphic primitives (→ `@orb/kit`); any zod wire schema (→ `@orb/contracts`).

## The producer-names-the-schema rule (locked)

> **A schema file is named for the domain that PRODUCES/OWNS its rows, never for a consumer.**

A consumer-named schema file hides its real producer (the port-from-neo antipattern; the enumerated cases are in `history/tier-1-2-archaeology-record.md`). Enforcement: compile-time (the schema file IS the type source — a move forces every importer) + the `db-structure` gate (asserts `schema/<feature>.ts` maps to a producing domain and the barrel re-exports every file; satellite tables map to their producer, e.g. `agent-principals` → `domain/sessions`, `gallery` → `domain/assets`).

## Cross-tier composition (who reads `db`)

`@orb/db`'s declared deps are only `kit` + `contracts` — a `db→server` import is impossible at resolve-time. Three sanctioned consumer patterns, all downward:

1. **Server persistence** — each domain's `persistence/` + `context.ts` closes over the `Db` handle and touches only its own tables. A verb never imports `@orb/db`; only `persistence/` does.
2. **The sanctioned bulk-serializer** — `import` + `export` share one serde core that reads schema tables directly (bulk serializers, not CRUD callers — `Spine-Config-and-Serialization.md`). Same posture as `search`/`discovery` on the vector tables (bulk read-only).
3. **The read-only-join ("pool.ts") pattern** — a domain owning a *view* of another domain's junction may read that junction directly (e.g. character list reading `character_tags + tags`), as long as the read is ownership-safe.

`@orb/client` never depends on `@orb/db`; `infra` is a sealed executor and never reads the schema.

## §7.4 — the DB row is the `db` home

- **DB row → `db`**; a domain may declare a derived local alias (`CharacterRow = typeof characters.$inferSelect`) in `persistence/`, never re-declare the column shape.
- **Cross-boundary enum tuples → `contracts`** (`db` imports them down for column `enum:[...]`; a test-mirror pins db === contracts where derivation isn't direct).
- **TypeID brands → `kit`**; the brand is type-only (SQL stays `TEXT`), so adding/removing a brand is never a migration.
- **Wire schemas / domain params never live here.** Gates: `types-in-contract`, `no-inline-types`, `schema-branding`, dep-cruiser `db-cake`.

## Esoteric / load-bearing

1. **The F32\_BLOB exact-scan note (ANN dropped).** No DiskANN/ANN shadow index exists. At corpus scale a full `ORDER BY vector_distance_cos(...) LIMIT k` is sub-millisecond and EXACT — the index was \~50× data bloat for nothing. Consequences: `vector32` stores the raw blob (sidestepping drizzle insert caveat #3899; the query vector is wrapped `vector32(?)` in search SQL), and `clearVectorTable` (domain/embeddings) is a plain `DELETE FROM` — safe precisely because there is no shadow graph to poison. Re-introducing ANN breaks both silently. (Carried in `custom-types/index.ts`.)

2. **The custom-type 4-byte-alignment `slice()`.** `vector32.fromDriver` copies via `value.slice().buffer` because the driver may return an unaligned subarray view `Float32Array` cannot wrap. Remove the copy and reads corrupt on unaligned rows. (Carried in `custom-types/index.ts`.)

3. **`chat_digests.scopedCharacterId` is ALWAYS a real branded `CharacterId` FK.** The room/SHARED bucket rows carry the room-designated witnessing character's id (or the synthetic group-as-character `__group__${chatId}`) — never NULL, never a sentinel (D55). The idempotent-upsert UNIQUE `(chatId, scopedCharacterId, tier, blockIdx)` keys off the real id. `schema/embeddings.ts` header is the current-state authority.

4. **The TypeID brand at the db boundary.** `$type<CharacterId>()` etc. are type-only; SQL is plain `TEXT`. `users.id` is deliberately a plain `Branded<"UserId">` nanoid, not a prefix-validated TypeID; inbound `ownerId`/`userId` FKs inherit that plainness.

5. **`foreign_keys` is per-connection and load-bearing.** SQLite defaults FK enforcement OFF; `createDb` sets `PRAGMA foreign_keys=ON` AND reads it back, refusing to boot if it didn't stick. `runMigrations` sets `foreign_keys=OFF` on the CONNECTION for the duration — drizzle's 12-step rebuild DROPs+recreates tables, and with FKs ON a `DROP TABLE parent` silently cascade-DELETEs a populated db. An in-file `PRAGMA foreign_keys=OFF` is a no-op (libSQL batches the migration and ignores mid-transaction toggles). `assertReferentialIntegrity` (`PRAGMA foreign_key_check`) runs after.

   `createDb` also sets a six-PRAGMA connection-tuning block after the FK set (order matters — `journal_mode=WAL` first, the rest assume it): `journal_mode=WAL` · `busy_timeout=5000` · `synchronous=NORMAL` · `cache_size=-1048576` (1GB) · `mmap_size=2147483648` (2GB) · `temp_store=MEMORY`. WAL + `busy_timeout` are the load-bearing pair: the WAL shutdown checkpoint (`preCloseHousekeeping`'s `wal_checkpoint(TRUNCATE)`) is a no-op without WAL, and `busy_timeout` makes a concurrent writer (the workloads worker races HTTP request writes) wait up to 5s instead of throwing `SQLITE_BUSY` immediately. `journal_mode` is read back and boot-refused on a `file:` URL (must be `wal`); a `:memory:`/non-file db correctly reports `memory` (WAL is file-only) and is accepted. libSQL honors all six (readback caveat: `mmap_size` floors to a page boundary, `busy_timeout` reads back under the `timeout` column).

6. **The `db-structure` barrel gate.** A schema file missing from `schema/index.ts` silently drops its tables from `typeof schema` and from migrations. The gate enforces the re-export AND the producer-mapping split.

## Invariants

1. **`db` imports only `kit` + `contracts`.** *(resolve-time physics; dep-cruiser `db-cake`.)*
2. **Producer names the schema file; the barrel re-exports every file.** *(`db-structure` gate.)*
3. **The DB row is the one home for column shapes; no wire schema in `db`.** *(`types-in-contract` / `no-inline-types`; `schema-branding` pins the `$type<>` brands.)*
4. **All five primary vector tables (character\_embeddings · image\_embeddings · chat\_digests · chat\_segments · document\_chunks, the last producer FK `documents.id`, owner derives via `documents.ownerId`) carry `content_hash` (staleness gate, NOT NULL) and `hub_score` (advisory `real`, written only by discovery via `embeddings.writeHubScores`, never nulled by a vector write).** *(compile-time DDL; `StoreParams` has no `hubScore`/`ownerId` field — D20.)*
5. **`@orb/db/kit` holds only drizzle-typed primitives** — they would fail `kit-purity` in `@orb/kit`. *(lint + resolve-time.)*
