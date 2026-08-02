---
kind: law
status: active
updated: 2026-08-02
---

# Orbweaver — `@orb/db`: the schema floor (drizzle + libSQL + migrations)

`@orb/db` is the third tier of the cake (`kit ← contracts ← db ← server ← client`): the drizzle schema, the libSQL client + PRAGMAs + migration runner, the native vector column type, and the db-layer primitives that need drizzle types. It sits below `server` (its only business-logic consumer) and above `contracts` + `kit` (it imports TypeID brands from `@orb/kit/ids` and enum tuples from `@orb/contracts`). The DB row types (`$inferSelect`/`$inferInsert`) are produced HERE; every domain imports them downward. The per-table design law lives in the schema files' own header comments (the code is the doc); this file carries only the cross-cutting db law.

## What this package owns

- **The drizzle schema** — every `sqliteTable`, one file per **producing** domain (`schema/<feature>.ts`) plus the reserved cross-cutting set (`users` · `audit` · `relations`; `custom-types/` is its own top-level dir, not a schema file — the former `agent-principals` schema file died with the 2026-07-25 agent-principal purge; only dormant DDL in `users.ts`/`chat.ts` survives, per the D60 build-state rider). `schema/index.ts` is the source-of-truth barrel; the `db-structure` gate enforces the domain split AND the re-export (a file missing from the barrel silently drops its tables from `typeof schema` and migrations).
- **The DB row types** — `$inferSelect`/`$inferInsert` (the §7.4 DB-row home). The TypeID brand lives AT the column (`$type<CharacterId>()`), so rows come back branded with no `castId` at the row→view seam.
- **The libSQL client + lifecycle** (`client/`) — `createDb(url, wrap?)`, the per-connection PRAGMA block, `runMigrations`, `assertReferentialIntegrity`, `backupBeforeMigrate`, `optimizeDb`, `preCloseHousekeeping`, and the `LibSqlWrap` injection seam (the OTel wrapper is passed IN from `foundation/observability` because `db` can't import `server`).
- **The migrations** — the fresh `0000_baseline.sql` + `meta/_journal.json` (born with every ledger decision already applied — no cv-pin, no `chats.ownerId`, `content_hash` on all five vector tables (character\_embeddings · image\_embeddings · chat\_digests · chat\_segments · document\_chunks), …).
- **The native vector column** (`custom-types/`) — `vector32` (libSQL `F32_BLOB(dim)`, raw little-endian Float32 blob), consumed by `schema/embeddings.ts` + `schema/discovery.ts` (the k-means `centroid`).
- **`@orb/db/kit`** — db-layer primitives that need drizzle types and cannot be kit-pure: `batch`, `db-errors` (the deep cause-walk constraint classifier), `fetch-owned` (`fetchOwned`/`OwnedTable`), `insert-chunk` (the libSQL 32766 bound-variable cap), `parsers` (the read-seam zod `.catch(null)` JSON-column coercion; the deliberate `null`-vs-`[]` contract asymmetry is load-bearing).

NOT owned: business logic (verbs/ownership/dispatch → `server`); the vector write path + `VECTOR_TABLES`/`clearVectorTable` (→ `domain/embeddings`, the table owner); the OTel wrap impl (injected); audit-log WRITES (`logAudit` → `foundation/observability`; the table stays here); pure-isomorphic primitives (→ `@orb/kit`); any zod wire schema (→ `@orb/contracts`).

## The producer-names-the-schema rule (locked)

> **A schema file is named for the domain that PRODUCES/OWNS its rows, never for a consumer.**

A consumer-named schema file hides its real producer (the port-from-neo antipattern; the enumerated cases are in `history/tier-1-2-archaeology-record.md`). Enforcement: compile-time (the schema file IS the type source — a move forces every importer) + the `db-structure` gate (asserts `schema/<feature>.ts` maps to a producing domain and the barrel re-exports every file; satellite tables map to their producer, e.g. `gallery` → `domain/assets`, `sdk-session` → the agent-sdk backend).

## Cross-tier composition (who reads `db`)

`@orb/db`'s declared deps are only `kit` + `contracts` — a `db→server` import is impossible at resolve-time. **The line is OWNERSHIP, not slot**: a domain touches the tables IT owns, and reaches another domain's DATA through an injected op (AGENTS §2 — cross-feature dependency is never a sideways import). Ownership is read off the schema layout: `schema/<feature>.ts` belongs to `domain/<feature>/` (producer-names-the-schema, above), with the non-domain producers mapped by the `db-structure` gate.

Four sanctioned consumer patterns, all downward:

1. **A verb writes its own domain's tables directly** via drizzle — `domain/chat/verbs/` writing `chats`/`messages` is the architecture working, not a leak. (This supersedes the former "a verb never imports `@orb/db`; only `persistence/` does": that sentence was never true — verbs imported tables before it was written, 69 verb files do it today, and it contradicted patterns 2–3 five lines below it.)
2. **`persistence/` holds the reusable READ helpers and the cross-domain OWNERSHIP CHECKS** — the domain's db-access slot, and the ONE place a cross-domain read belongs (`persona/persistence/queries.ts`'s `ensureCharacterOwned`/`loadOwnedCharacterCard`: read the owner predicate in the WHERE, collapse foreign-or-absent to one not-found error). A verb needing another domain's row chains a `persistence/` helper — it does not open the table itself.
3. **The bulk serializers / analytics read foreign tables directly, by design** — `import` + `export` share one serde core that reads schema tables directly (bulk serializers, not CRUD callers — `Spine-Config-and-Serialization.md`); `search` and `discovery` hold the same bulk read-only posture (discovery computes themes/duplicates/hubness BY reading other domains' rows). READ-only: `import` writes six domains' canon and imports `@orb/db` **zero** times — every write routes through the owning domain's own `persistence/import-write.ts`.
4. **The read-only-join ("pool.ts") pattern** — a domain owning a *view* of another domain's junction may read that junction directly (`chat/assembly/world-info/pool.ts` over the world-info book junctions; character list reading `character_tags + tags`), as long as the read is ownership-safe. A **shared polymorphic junction gets ONE write seam**: the five entity↔tag junctions are written through `tag/persistence/junctions.ts`, never re-spelled per owning domain.

Enforcement: the `own-tables-only` gate makes the ownership half structural — outside `persistence/`, a domain-side value import of a foreign table from `@orb/db` is RED (the type-only row import is always legal — §7.4), and a foreign table in an `insert`/`update`/`delete` position is RED unconditionally: no class exemption buys a foreign WRITE. Its table→domain map is DERIVED from the schema files; patterns 3–4 are its cited `BULK_READERS` / `FILE_ALLOWLIST` rows, each with a both-ways stale ratchet. `no-direct-users-read` and `discovery-no-stats-rollups` are the two narrower table-symbol seals that predate it.

`@orb/client` never depends on `@orb/db`; `infra` is a sealed executor and never reads the schema.

## §7.4 — the DB row is the `db` home

- **DB row → `db`**; a domain may declare a derived local alias (`CharacterRow = typeof characters.$inferSelect`) in `persistence/`, never re-declare the column shape.
- **Cross-boundary enum tuples → `contracts`** (`db` imports them down for column `enum:[...]`; a test-mirror pins db === contracts where derivation isn't direct).
- **TypeID brands → `kit`**; the brand is type-only (SQL stays `TEXT`), so adding/removing a brand is never a migration.
- **Wire schemas / domain params never live here.** Gates: `types-in-contract`, `no-inline-types`, `schema-branding`, dep-cruiser `db-cake`.

## The migration lifecycle — today's squash, and "when we migrate for real"

There are exactly TWO regimes, separated by launch day. Both are written here NOW so the first
incremental migration lands into a documented procedure instead of minting one under pressure.

### Regime 1 — PRE-LAUNCH (today): one squashed baseline, regenerated

A schema change is a SOURCE edit plus a REGENERATED baseline. There is no `0001`. The whole procedure:

1. Edit `schema/<feature>.ts`.
2. Regenerate over a CLEARED migrations dir — `rm -rf packages/db/src/migrations` then
   `pnpm --filter @orb/db exec drizzle-kit generate --name baseline --config=drizzle.config.ts`. The
   `--name baseline` is not cosmetic: the journal's single entry must stay `{ idx: 0, tag: "0000_baseline" }`.
3. `biome format --write` the two `migrations/meta` files (drizzle emits unformatted JSON; `lint:biome`
   reds otherwise). Scope the `--write` to those files — never a repo-wide fix-all.
4. Verify with the two stages, not by eye: `pnpm check:db-baseline` (schema ≡ baseline) and
   `pnpm check:drizzle-kit` (the journal/snapshot chain).

**The dev-db consequence is automatic and lossy by design.** `entry/boot/migrate.ts` hashes the shipped
baseline against what the dev db recorded; a mismatch takes a backup, DROPS the database, and re-migrates
from the fresh baseline (logged `BASELINE REGENERATED … RESETTING`). So a regen means: the next stack boot
re-mints the dev db and every seeded row is gone. That is the pre-launch bargain — no migration debt in
exchange for a disposable dev db.

Enforcement of the regime itself: the `baseline-single-migration` gate (exactly one `.sql`, exactly one
journal entry) and its runtime twin `LAUNCHED` in `entry/boot/migrate.ts`.

### Regime 2 — POST-LAUNCH: forward-only incremental migrations

The instant a database exists that we cannot drop, the squash policy INVERTS: regenerating the baseline
would mean destroying live data, so the baseline freezes and every change ships as a forward `000N`.

**Launch day is a two-switch flip, both in the same commit:** `LAUNCHED = true` in
`scripts/check/gates/baseline-single-migration.ts` (the gate stops demanding a single baseline) AND
`LAUNCHED` in `packages/server/src/entry/boot/migrate.ts` (baseline drift becomes boot-FATAL instead of an
auto-wipe). Flipping one without the other is the worst state: either the gate refuses every new migration,
or a launched db silently auto-wipes.

The per-change procedure after that:

1. Edit `schema/<feature>.ts`.
2. `pnpm --filter @orb/db exec drizzle-kit generate --name <what-changed> --config=drizzle.config.ts` —
   NO clearing. drizzle diffs the previous `meta/<n>_snapshot.json` against the live schema and emits
   `000N_<name>.sql` + `meta/000N_snapshot.json` + a new journal entry. The snapshot chain IS the history;
   `meta/` is committed, never gitignored, never hand-edited.
3. READ the emitted SQL before committing. SQLite cannot `ALTER TABLE … DROP CONSTRAINT` or change a
   column type, so drizzle emits its 12-step table rebuild (create `__new_x` → copy → drop → rename) for
   those. That rebuild is why `runMigrations` turns `foreign_keys=OFF` on the connection (§Esoteric #5) and
   why `assertReferentialIntegrity` runs after — a rebuild that drops a parent with FKs ON would
   cascade-delete children. A hand-written data backfill goes in the SAME `.sql` file, after the DDL.
4. Never EDIT or DELETE an applied migration: drizzle records applied tags in `__drizzle_migrations`, so a
   rewritten `.sql` is simply never re-run on an existing db and silently diverges from a fresh one. A
   mistake in an applied migration is fixed by a NEW forward migration.
5. Verify with all three, in this order:
   - `pnpm check:drizzle-kit` — the chain: every journal entry has its snapshot and no two snapshots claim
     the same parent. This is the ONE that catches the concurrent-generation FORK (two branches each
     generating `0003` off `0002`) — the failure mode that goes from impossible to routine the moment the
     chain grows past one entry, and precisely why the stage is wired now.
   - `pnpm check:db-baseline` — schema ≡ the CUMULATIVE migrations. It compares the live schema to
     `0000_baseline.sql` alone, so **it must be re-pointed at the applied chain when regime 2 begins**
     (`scripts/verify/db-baseline-parity.ts` — generate from the last snapshot instead of from `{}`); until
     then it would red on every legitimate incremental. Left in place for regime 1's benefit; this line is
     the reminder that it is regime-1-shaped.
   - the boot path against a COPY of a real db — `assertReferentialIntegrity` after the run is the belt
     that a 12-step rebuild did not orphan rows.

The two stages guard orthogonal halves and neither sees the other's failure: `structure:db-baseline` is
CONTENT parity (did you forget to regenerate?), `structure:drizzle-kit` is CHAIN integrity (did two people
generate against the same parent?).

## Esoteric / load-bearing

1. **The F32\_BLOB exact-scan note (ANN dropped).** No DiskANN/ANN shadow index exists. At corpus scale a full `ORDER BY vector_distance_cos(...) LIMIT k` is sub-millisecond and EXACT — the index was \~50× data bloat for nothing. Consequences: `vector32` stores the raw blob (sidestepping drizzle insert caveat #3899; the query vector is wrapped `vector32(?)` in search SQL), and `clearVectorTable` (domain/embeddings) is a plain `DELETE FROM` — safe precisely because there is no shadow graph to poison. Re-introducing ANN breaks both silently. (Carried in `custom-types/index.ts`.)

2. **The custom-type 4-byte-alignment `slice()`.** `vector32.fromDriver` copies via `value.slice().buffer` because the driver may return an unaligned subarray view `Float32Array` cannot wrap. Remove the copy and reads corrupt on unaligned rows. (Carried in `custom-types/index.ts`.)

3. **`chat_digests.scopedCharacterId` is ALWAYS a real branded `CharacterId` FK.** The room/SHARED bucket rows carry the room-designated witnessing character's id (or the synthetic group-as-character `__group__${chatId}`) — never NULL, never a sentinel (D55). The idempotent-upsert UNIQUE `(chatId, scopedCharacterId, tier, blockIdx)` keys off the real id. `schema/embeddings.ts` header is the current-state authority.

4. **The TypeID brand at the db boundary.** `$type<CharacterId>()` etc. are type-only; SQL is plain `TEXT`. `users.id` is deliberately a plain `Branded<"UserId">` nanoid, not a prefix-validated TypeID; inbound `ownerId`/`userId` FKs inherit that plainness.

5. **`foreign_keys` is per-connection and load-bearing.** SQLite defaults FK enforcement OFF; `createDb` sets `PRAGMA foreign_keys=ON` AND reads it back, refusing to boot if it didn't stick. `runMigrations` sets `foreign_keys=OFF` on the CONNECTION for the duration — drizzle's 12-step rebuild DROPs+recreates tables, and with FKs ON a `DROP TABLE parent` silently cascade-DELETEs a populated db. An in-file `PRAGMA foreign_keys=OFF` is a no-op (libSQL batches the migration and ignores mid-transaction toggles). `assertReferentialIntegrity` (`PRAGMA foreign_key_check`) runs after.

   `createDb` also sets a six-PRAGMA connection-tuning block after the FK set (order matters — `journal_mode=WAL` first, the rest assume it): `journal_mode=WAL` · `busy_timeout=5000` · `synchronous=NORMAL` · `cache_size=-1048576` (1GB) · `mmap_size=2147483648` (2GB) · `temp_store=MEMORY`. WAL + `busy_timeout` are the load-bearing pair: the WAL shutdown checkpoint (`preCloseHousekeeping`'s `wal_checkpoint(TRUNCATE)`) is a no-op without WAL, and `busy_timeout` makes a concurrent writer (the workloads worker races HTTP request writes) wait up to 5s instead of throwing `SQLITE_BUSY` immediately. `journal_mode` is read back and boot-refused on a `file:` URL (must be `wal`); a `:memory:`/non-file db correctly reports `memory` (WAL is file-only) and is accepted. libSQL honors all six (readback caveat: `mmap_size` floors to a page boundary, `busy_timeout` reads back under the `timeout` column).

6. **PRAGMAs guard a CONNECTION, and `client.transaction()` can hand you a different one.** libSQL `file:`
   mode holds ONE native connection; `client.transaction()` takes it for the tx object, so the next
   `execute` lazily opens a FRESH connection that never ran `createDb`'s PRAGMA block. What survives that
   replacement differs per pragma and was measured, not assumed: `journal_mode=WAL` survives (it is
   persisted in the db FILE, not the connection), `foreign_keys=ON` survives (libsql's native default —
   proven by an FK-rejection probe on the replacement connection), and `busy_timeout` did NOT (it read back
   0\) until the `Config.timeout` belt landed in `createClient`. The full which-mechanism-guards-which-
   connection answer is carried at `packages/db/src/client/index.ts` (the `TUNING_PRAGMAS` block) — read it
   there before adding a seventh pragma, because a new one is guarded by NOTHING on a replacement
   connection unless it is either file-persisted, a libsql native default, or passed through the client
   `Config`.

7. **The `db-structure` barrel gate.** A schema file missing from `schema/index.ts` silently drops its tables from `typeof schema` and from migrations. The gate enforces the re-export AND the producer-mapping split.

## Invariants

1. **`db` imports only `kit` + `contracts`.** *(resolve-time physics; dep-cruiser `db-cake`.)*
2. **Producer names the schema file; the barrel re-exports every file.** *(`db-structure` gate.)*
3. **The DB row is the one home for column shapes; no wire schema in `db`.** *(`types-in-contract` / `no-inline-types`; `schema-branding` pins the `$type<>` brands.)*
4. **All five primary vector tables (character\_embeddings · image\_embeddings · chat\_digests · chat\_segments · document\_chunks, the last producer FK `documents.id`, owner derives via `documents.ownerId`) carry `content_hash` (staleness gate, NOT NULL) and `hub_score` (advisory `real`, written only by discovery via `embeddings.writeHubScores`, never nulled by a vector write).** *(compile-time DDL; `StoreParams` has no `hubScore`/`ownerId` field — D20.)*
5. **`@orb/db/kit` holds only drizzle-typed primitives** — they would fail `kit-purity` in `@orb/kit`. *(lint + resolve-time.)* `@orb/db/kit` is their ONLY import path: the top barrel deliberately does NOT re-export `./kit` (2026-08-02 — while it did, half the tree reached `batchMany`/`fetchOwned`/`isConstraintViolation` through `@orb/db`, which reads as "a table-ish thing from the schema barrel" and blurs the very line invariant 6 draws). *(resolve-time: the wrong path no longer compiles.)*
6. **A domain touches only the tables it OWNS; cross-domain data comes from an injected op, and a cross-domain READ lives in `persistence/`.** *(`own-tables-only` gate outside `persistence/`, with the derived schema→domain ownership map; `no-direct-users-read` + `discovery-no-stats-rollups` for the two narrower table seals.)* The WRITE half has no gate arm inside `persistence/` (that slot is scoped out), so it is carried by the convention: a cross-domain write is the OWNING domain's persistence factory, injected as an op — `character/persistence/avatar-link-write.ts`'s `createLinkCharacterAvatars` (consumed by `assets.backfillAvatars` as `AssetsContext.linkCharacterAvatars`) and `persona/persistence/import-write.ts`'s `createBulkImportPersonas` (consumed by `import`) are the two worked examples.
7. **Every `.references()` column LEADS an index, and every `.references()` states its `onDelete`.** SQLite auto-indexes only the PARENT side of an FK and defaults the child action to `NO ACTION` — both silences cost real behavior (a full child-table scan per parent delete; a delete that fails at commit for reasons nobody chose). *(`fk-columns-indexed` + `fk-ondelete-stated` gates; plain B-tree only — an ANN shadow index is rejected, §Esoteric #1.)*
8. **Every table declares a primary key** — inline `.primaryKey()` or composite `primaryKey({ columns })`; the hidden `rowid` is unstable across VACUUM, invisible to `$inferSelect`, and unreferenceable, so a keyless table can never be an FK parent nor part of the inherited-ownership chain. *(`table-explicit-primary-key` gate.)*
