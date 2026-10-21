---
kind: law
status: active
updated: 2026-10-16
---

# Orbweaver — `@orb/db`: the schema floor (drizzle + libSQL + migrations)

`@orb/db` is the third tier of the cake (`kit ← contracts ← db ← server ← client`): the drizzle schema, the libSQL client + PRAGMAs + migration runner, the native vector column type, and the db-layer primitives that need drizzle types. It sits below `server` (its only business-logic consumer) and above `contracts` + `kit` (it imports TypeID brands from `@orb/kit/ids` and enum tuples from `@orb/contracts`). The DB row types (`$inferSelect`/`$inferInsert`) are produced HERE; every domain imports them downward. The per-table design law lives in the schema files' own header comments (the code is the doc); this file carries only the cross-cutting db law.

## What this package owns

- **The drizzle schema** — every `sqliteTable`, one file per **producing** domain (`schema/<feature>.ts`) plus the reserved cross-cutting set (`users` · `audit` · `relations`; `custom-types/` is its own top-level dir, not a schema file — `agent-principals` is not a schema file; only dormant DDL in `users.ts`/`chat.ts` survives, per the D60 build-state rider). `schema/index.ts` is the source-of-truth barrel; `tests/db/schema/module-structure.suite.test.ts` enforces the domain split AND the re-export (a file missing from the barrel silently drops its tables from `typeof schema` and migrations).
- **The DB row types** — `$inferSelect`/`$inferInsert` (the §7.4 DB-row home). The TypeID brand lives AT the column (`$type<CharacterId>()`), so rows come back branded with no `castId` at the row→view seam.
- **The libSQL client + lifecycle** (`client/`) — `createDb(url, wrap?)`, the per-connection PRAGMA block, `runMigrations`, `assertReferentialIntegrity`, `backupBeforeMigrate` + the pinnable `pruneDbBackups` sweep, `optimizeDb`, `preCloseHousekeeping`, and the `LibSqlWrap` injection seam (the OTel wrapper is passed IN from `foundation/observability` because `db` can't import `server`).
- **The migrations** — the initial `0000_baseline.sql` plus every forward `000N` after it; never regenerate the baseline. `meta/` is the committed snapshot chain and is never hand-edited. The initial baseline includes every ledger decision then in scope — no cv-pin, no `chats.ownerId`, `content_hash` on all five vector tables (character_embeddings · image_embeddings · chat_digests · chat_segments · document_chunks).
- **The native vector column** (`custom-types/`) — `vector32` (libSQL `F32_BLOB(dim)`, raw little-endian Float32 blob), consumed by the five vector tables in `schema/embeddings.ts`.
- **`@orb/db/query`** — db-layer primitives that need drizzle types and cannot be kit-pure: `batch`, `db-errors` (the deep cause-walk constraint classifier), `fetch-owned` (`fetchOwned`/`OwnedTable`), `insert-chunk` (the libSQL 32766 bound-variable cap), `parsers` (the read-seam zod `.catch(null)` JSON-column coercion; the `null`-vs-`[]` contract asymmetry is deliberate and must not be collapsed).

NOT owned: business logic (verbs/ownership/dispatch → `server`); the vector write path + `VECTOR_TABLES` (→ `domain/embeddings`, the table owner); the OTel wrap impl (injected); audit-log WRITES (`logAudit` → `foundation/observability`; the table stays here); pure-isomorphic primitives (→ `@orb/kit`); any zod wire schema (→ `@orb/contracts`).

## The producer-names-the-schema rule (locked)

> **A schema file is named for the domain that PRODUCES/OWNS its rows, never for a consumer.**

A consumer-named schema file hides its real producer (the port-from-neo antipattern). Enforcement: compile-time (the schema file IS the type source — a move forces every importer) + `tests/db/schema/module-structure.suite.test.ts` (asserts `schema/<feature>.ts` maps to a producing domain and the barrel re-exports every file; satellite tables map to their producer, e.g. `gallery` → `domain/assets`, `sdk-session` → `domain/connection`'s injected persistence adapter). The inference backend owns the session-cache lifecycle and imports no database (D8/D25).

## Cross-tier composition (who reads `db`)

`@orb/db`'s declared deps are only `kit` + `contracts` — a `db→server` import is impossible at resolve-time. **The line is OWNERSHIP, not slot**: a domain touches the tables IT owns, and reaches another domain's DATA through an injected op (Constitution.md §2 — cross-feature dependency is never a sideways import). Ownership is read off the schema layout: `schema/<feature>.ts` belongs to `domain/<feature>/` (producer-names-the-schema, above), with the non-domain producers mapped by `tests/db/schema/module-structure.suite.test.ts`.

Four sanctioned consumer patterns, all downward:

1. **A verb writes its own domain's tables directly** via drizzle — `domain/chat/verbs/` writing `chats`/`messages` is the architecture working, not a leak. (This supersedes the former "a verb never imports `@orb/db`; only `persistence/` does": that sentence was never true — verbs imported tables before it was written, 69 verb files do it today, and it contradicted patterns 2–3 five lines below it.)
2. **`persistence/` holds the reusable READ helpers and the cross-domain OWNERSHIP CHECKS** — the domain's db-access slot, and the ONE place a cross-domain read belongs (`persona/persistence/queries.ts`'s `ensureCharacterOwned`/`loadOwnedCharacterCard`: read the owner predicate in the WHERE, collapse foreign-or-absent to one not-found error). A verb needing another domain's row chains a `persistence/` helper — it does not open the table itself.
3. **The bulk serializers / analytics read foreign tables directly, by design** — `import` + `export` share one serde core that reads schema tables directly (bulk serializers, not CRUD callers — `Spine-Config-and-Serialization.md`); `search` and `discovery` hold the same bulk read-only posture (discovery computes themes/duplicates/hubness BY reading other domains' rows). READ-only: `import` writes six domains' canon and imports `@orb/db` **zero** times — every write routes through the owning domain's own `persistence/import-write.ts`.
4. **The read-only-join ("pool.ts") pattern** — a domain owning a *view* of another domain's junction may read that junction directly (`chat/assembly/world-info/pool.ts` over the world-info book junctions; character list reading `character_tags + tags`), as long as the read is ownership-safe. A **shared polymorphic junction gets ONE write seam**: the five entity↔tag junctions are written through `tag/persistence/junctions.ts`, never re-spelled per owning domain.

D333 retires custom static ownership checks. Table ownership remains architecture law; package imports and injected domain ports preserve the runtime boundary.

`@orb/client` never depends on `@orb/db`; `infra` is a sealed executor and never reads the schema.

## §7.4 — the DB row is the `db` home

- **DB row → `db`**; a domain may declare a derived local alias (`CharacterRow = typeof characters.$inferSelect`) in `persistence/`, never re-declare the column shape.
- **Cross-boundary enum tuples → `contracts`** (`db` imports them down for column `enum:[...]`; a test-mirror pins db === contracts where derivation isn't direct).
- **TypeID brands → `kit`**; the brand is type-only (SQL stays `TEXT`), so adding/removing a brand is never a migration.
- **Wire schemas / domain params never live here.** D333 retires custom type-home and schema-brand checks; the package dependency boundary remains.

## The migration lifecycle — forward-only

Every schema change ships as a numbered migration. The committed baseline is historical input and is never regenerated. A deliberate local reset is `pnpm seed:demo --fresh`. D333 retires custom schema-to-migration parity checking.

1. Edit `schema/<feature>.ts`.
2. Generate a numbered migration with `pnpm --filter @orb/db exec drizzle-kit generate --name <what-changed> --config=drizzle.config.ts`. Never clear the migrations directory.
3. Read the generated SQL. SQLite table rebuilds use the 12-step pattern; a data backfill belongs in the same migration after its DDL.
4. Never edit or delete an applied migration. Fix it with a new forward migration.
5. Run `pnpm --filter @orb/db exec drizzle-kit check --config=drizzle.config.ts` to validate the journal and snapshot chain. Test migration behavior against a copy of a real database and verify referential integrity.

`DB_LAUNCHED = true` in `packages/server/src/entry/boot/migrate.ts` refuses a database whose recorded migration is absent from the shipped journal. It never resets the database automatically.

## Esoteric / required behavior

1. **The F32_BLOB exact-scan note (ANN dropped).** No DiskANN/ANN shadow index exists. At corpus scale a full `ORDER BY vector_distance_cos(...) LIMIT k` is sub-millisecond and EXACT — an index would be ~50× data bloat for nothing. Consequences: `vector32` stores the raw blob (sidestepping a documented drizzle-orm insert-binding caveat; the query vector is wrapped `vector32(?)` in search SQL), and vector pruning in `domain/embeddings/persistence/clear.ts` uses plain deletes without a shadow graph to synchronize. Re-introducing ANN changes both requirements. It would also break mixed widths: libSQL enforces a declared `F32_BLOB(N)` width only through a vector index, so today one column holds every owner's width and the declared 1024 is inert DDL. (Carried in `custom-types/index.ts`.)

2. **The custom-type 4-byte-alignment `slice()`.** `vector32.fromDriver` copies via `value.slice().buffer` because the driver may return an unaligned subarray view `Float32Array` cannot wrap. Remove the copy and reads corrupt on unaligned rows. (Carried in `custom-types/index.ts`.)

3. **`chat_digests.scopedCharacterId` is ALWAYS a real branded `CharacterId` FK.** The room/SHARED bucket rows carry the room-designated witnessing character's id (or the synthetic group-as-character `__group__${chatId}`) — never NULL, never a sentinel (D55). The idempotent-upsert UNIQUE `(chatId, scopedCharacterId, tier, blockIdx)` keys off the real id. `schema/embeddings.ts` header is the current-state authority.

4. **The TypeID brand at the db boundary.** `$type<CharacterId>()` etc. are type-only; SQL is plain `TEXT`. `users.id` is deliberately a plain `Branded<"UserId">` nanoid, not a prefix-validated TypeID; inbound `ownerId`/`userId` FKs inherit that plainness.

5. **`foreign_keys` is per-connection and required.** SQLite defaults FK enforcement OFF; `createDb` sets `PRAGMA foreign_keys=ON` AND reads it back, refusing to boot if it didn't stick. `runMigrations` sets `foreign_keys=OFF` on the CONNECTION for the duration — drizzle's 12-step rebuild DROPs+recreates tables, and with FKs ON a `DROP TABLE parent` silently cascade-DELETEs a populated db. An in-file `PRAGMA foreign_keys=OFF` is a no-op (libSQL batches the migration and ignores mid-transaction toggles). `assertReferentialIntegrity` (`PRAGMA foreign_key_check`) runs after.

   `createDb` also sets a six-PRAGMA connection-tuning block after the FK set (order matters — `journal_mode=WAL` first, the rest assume it): `journal_mode=WAL` · `busy_timeout=5000` · `synchronous=NORMAL` · `cache_size=-1048576` (1GB) · `mmap_size=2147483648` (2GB) · `temp_store=MEMORY`. WAL + `busy_timeout` are both required: the WAL shutdown checkpoint (`preCloseHousekeeping`'s `wal_checkpoint(TRUNCATE)`) is a no-op without WAL, and `busy_timeout` makes a concurrent writer (the workloads worker races HTTP request writes) wait up to 5s instead of throwing `SQLITE_BUSY` immediately. `journal_mode` is read back and boot-refused on a `file:` URL (must be `wal`); a `:memory:`/non-file db correctly reports `memory` (WAL is file-only) and is accepted. libSQL honors all six (readback caveat: `mmap_size` floors to a page boundary, `busy_timeout` reads back under the `timeout` column).

6. **Keep local file operations on the configured connection.** `createDb` limits the local file client's native connection pool through `Config.concurrency`. Each operation borrows that connection, preserving its tuning and the migration FK suspension. An interactive transaction holds the connection until it settles; another operation is rejected while it remains held. The settled transaction returns the connection to the pool. `Config.timeout` also configures any replacement connection, but does not preserve other connection-local PRAGMAs. Remote clients retain their own concurrency. See `packages/db/src/client/index.ts` and `legacy-source/db/client/index.int.test.ts` for configuration and concurrent enforcement checks.

7. **The schema barrel test.** A schema file missing from `schema/index.ts` silently drops its tables from `typeof schema` and from migrations. `tests/db/schema/module-structure.suite.test.ts` enforces the re-export AND the producer-mapping split.

8. **Concurrent creation: the unique constraint decides the race.** Let a UNIQUE or primary-key constraint decide which writer creates one logical unit of work. Do not pre-check. Do not add a reservation or lease table.

   - Commit the whole unit in one `db.batch`, so a losing writer leaves no partial rows.
   - Classify a failure with `isConstraintViolation` from `@orb/db/query`.
   - Treat a violation as a lost race only when a re-read explains it. For an import, the winner's claim row is now visible (`commitImportCandidate`). For a canon append, the head has reached the attempted seq (`commitCanonAppend`).
   - Rethrow every other failure. This includes a unique violation that the re-read does not explain.
   - After a lost race, use the winner's result, or re-allocate and rebuild the attempt with new ids.
   - Never re-run work that is already paid for, such as a provider call.
   - Bound any re-allocation loop. Repeated loss means a defect elsewhere, not contention.

   A reservation table is rejected because a crash can leave an ownerless pending claim. Cleaning that up needs leases and reaping that these operations do not otherwise need.

   Homes: `packages/db/src/query/db-errors.ts`, `packages/server/src/domain/chat/persistence/canon-write.ts`, `packages/server/src/domain/chat/persistence/import-write.ts`.

## Invariants

1. **`db` imports only `kit` + `contracts`.** *(resolve-time physics; dep-cruiser `db-cake`.)*
2. **Producer names the schema file; the barrel re-exports every file.** *(`tests/db/schema/module-structure.suite.test.ts`.)*
3. **The DB row is the one home for column shapes; no wire schema in `db`.** D333 retires custom type-home and schema-brand checks.
4. **All five primary vector tables (character_embeddings · image_embeddings · chat_digests · chat_segments · document_chunks, the last producer FK `documents.id`, owner derives via `documents.ownerId`) carry `content_hash` (staleness field, NOT NULL) and `hub_score` (advisory `real`, written only by discovery via `embeddings.writeHubScores`, never nulled by a vector write).** *(compile-time DDL; `StoreParams` has no `hubScore`/`ownerId` field — D20.)*
5. **`@orb/db/query` holds only drizzle-typed primitives** — they would fail `kit-purity` in `@orb/kit`. *(lint + resolve-time.)* `@orb/db/query` is their ONLY import path: the top barrel deliberately does NOT re-export `"./kit"` — re-exporting it lets the tree reach `batchMany`/`fetchOwned`/`isConstraintViolation` through `@orb/db`, which reads as "a table-ish thing from the schema barrel" and blurs the line invariant 6 draws. *(resolve-time: the wrong path does not compile.)*
6. **A domain writes only its own tables.** Cross-domain reads belong in `persistence/` or injected ops. D333 retires custom ownership checks; this remains architecture law. Settings alone imports its KV table and injects registered-prefix opaque-value ports. The KV port refuses foreign keys before I/O.
7. **Every `.references()` column LEADS an index, and every `.references()` states its `onDelete`.** SQLite auto-indexes only the PARENT side of an FK and defaults the child action to `NO ACTION` — both silences cost real behavior (a full child-table scan per parent delete; a delete that fails at commit for reasons nobody chose). *(`tests/db/schema/table-integrity.suite.test.ts`; plain B-tree only — an ANN shadow index is rejected, Esoteric item 1 above.)*
8. **Every table declares a primary key** — inline `.primaryKey()` or composite `primaryKey({ columns })`; the hidden `rowid` is unstable across VACUUM, invisible to `$inferSelect`, and unreferenceable, so a keyless table can never be an FK parent nor part of the inherited-ownership chain. *(`tests/db/schema/table-integrity.suite.test.ts`.)*
