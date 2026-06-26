# Orbweaver — `@orb/db`: the schema floor (drizzle + libSQL + migrations)

> **Status: planning (package survey).** `@orb/db` is the third tier of the cake
> (`kit ← contracts ← db ← server ← client`): the drizzle schema, the libSQL client + PRAGMAs +
> migration runner, the native vector column type, and the db-layer primitives that need drizzle types.
> It sits **below `server`** (server is its only business-logic consumer) and **above `contracts` + `kit`**
> (it imports the TypeID brands from `@orb/kit/ids` and enum tuples from `@orb/contracts`). The DB row
> types (`$inferSelect`/`$inferInsert`) are produced HERE; every domain imports them downward.
> Authoritative upstream: `structure.md` §2 (the cake — `db` deps kit+contracts only), §6 (the
> partitioning rule), §7 (the six gates); `_FANOUT-BRIEF.md` §2 (the one-directional hard rule), §3
> (placement taxonomy), §5 (the `db/` work-list — the schema-naming lies, the cv-pin column,
> `chats.personaId`, the F32_BLOB exact-scan note), §7.4 (DB row → `db` home); `reports/shared-
> dissolution.md` §3 (`@orb/db/kit` = `batch`/`db-errors`/`fetch-owned`); and the adjacent domain docs
> that mandate the schema changes (`domains/embeddings.md`, `character.md`, `persona.md`, `tag.md`,
> `discovery.md`).

---

## What this package owns

- **The drizzle schema** — every `sqliteTable` definition, organized one file per **producing** domain
  (`schema/<feature>.ts` mirrors `domain/<feature>`) plus a reserved cross-cutting set
  (`users` · `audit` · `custom-types` · `relations`). The schema is the machine-of-record for the data
  model; the `db-structure` check gate enforces the domain split AND that every file is re-exported from
  the barrel (a file missing from `schema/index.ts` silently drops its tables).
- **The DB row types** — `typeof <table>.$inferSelect` / `$inferInsert`. Per §7.4 the **DB row is the
  `db` home**; domains derive their persistence types from these and never re-declare the column shape.
  The TypeID brand lives AT the column (`$type<CharacterId>()`), so `$inferSelect` returns branded ids
  with no `castId` at the row→view seam.
- **The libSQL client + lifecycle** (`client.ts`) — `createDb(url, wrap?)` (the path-agnostic factory),
  the per-connection PRAGMA block (`foreign_keys=ON` is load-bearing, with a startup readback),
  `runMigrations` (with the `foreign_keys=OFF`-on-the-connection dance), `assertReferentialIntegrity`
  (`PRAGMA foreign_key_check`), `backupBeforeMigrate`, `optimizeDb`, `preCloseHousekeeping`, and the
  `LibSqlWrap` injection seam (the OTel tracing wrapper is passed IN from `server/observability` because
  `db` can't import `server`).
- **The migrations** (`migrations/*.sql` + `meta/_journal.json`) — the applied DDL ledger. neo-tavern
  squashed to `0000_baseline`; orbweaver starts a fresh baseline that is born with every column change
  below already correct.
- **The native vector column** (`custom-types.ts`) — `vector32` (libSQL `F32_BLOB(dim)`, raw
  little-endian Float32 blob). A reserved cross-cutting db artifact, consumed by `schema/embeddings.ts`
  (the four vector tables) and `schema/discovery.ts` (the k-means `centroid` rollup column).
- **`@orb/db/kit`** — db-layer primitives that need drizzle types and therefore **cannot be kit-pure**:
  `batch` (`batchStmt`/`batchMany`), `db-errors` (`isConstraintViolation` + the constraint classifiers),
  `fetch-owned` (`fetchOwned`/`OwnedTable`), and `insert-chunk` (`rowsPerInsert`/`chunkRows`).

This package does **NOT** own: any business logic (verbs, ownership policy, dispatch — all `server`);
the vector WRITE path (`embeddings.store` — the schema is here, the inserter is the domain); the
`clearVectorTable` / `VECTOR_TABLES` registry (those move UP to `domain/embeddings` — they are the
table-owner's, not the db layer's); the OTel tracing wrapper (injected from `server/observability`);
audit-log WRITES (`logAudit` → `foundation/observability`; the `audit` *table* stays here); the
pure-isomorphic primitives (`ids`/`errors`/`vector-math` → `@orb/kit`); any zod **wire** schema (→
`@orb/contracts`).

---

## The producer-names-the-schema rule (locked)

> **A schema file is named for the domain that PRODUCES/OWNS its rows, never for a consumer.**

This is the single rule that fixes neo-tavern's schema-naming lies. neo-tavern named three files for
their *readers*:

| Lie (neo-tavern) | The tables | Truth (orbweaver) |
|---|---|---|
| `db/schema/search.ts` | `character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments`, `chat_digest_speakers` | `search` only *reads* these; the **producer** is `embeddings` (the one write path) → `schema/embeddings.ts` |
| `db/schema/character.ts` holds `personas` + `character_personas` | the `personas` table | persona rows are produced by the `persona` domain → `personas` → `schema/persona.ts` |
| `db/schema/corpus.ts` | the 6 analytics rollups | `corpus`→`discovery` rename; they are discovery's own rollups → `schema/discovery.ts` |

Enforcement: **compile-time** — the schema file *is* the type source; moving it forces every importer to
update or `tsc` fails. The `db-structure` gate additionally asserts `schema/<feature>.ts` mirrors
`domain/<feature>` (the lie would re-introduce a file with no matching domain).

---

## Internal layout

```
packages/db/src/
├── client.ts              libSQL factory + PRAGMAs + runMigrations + assertReferentialIntegrity
│                          + backupBeforeMigrate + preCloseHousekeeping + the LibSqlWrap seam
├── custom-types.ts        vector32 (F32_BLOB) — the native vector column (reserved cross-cutting)
├── kit/                   DB-LAYER PRIMITIVES (need drizzle types — NOT @orb/kit-pure)
│   ├── batch.ts           batchStmt / batchMany  (Parameters<Db["batch"]> tuple bridge)
│   ├── db-errors.ts       isConstraintViolation  (SQLITE_CONSTRAINT* + the cause-walk classifiers)
│   ├── fetch-owned.ts     fetchOwned / OwnedTable (the one owner-scoped single-row fetch)
│   ├── insert-chunk.ts    rowsPerInsert / chunkRows (the libSQL 32766 bound-variable cap)
│   └── parsers.ts         read-seam JSON column parsers (zod .catch(null)) — row→view coercion
│                          (RESOLVED home: @orb/db/kit/parsers.ts, paired with $type<> columns)
├── schema/
│   ├── index.ts           BARREL — db-structure gate: every file re-exported here (else tables drop)
│   ├── relations.ts       drizzle relations() (reserved cross-cutting; updated for de-pin)
│   ├── users.ts           identity root (reserved cross-cutting — every owned table FKs here)
│   ├── audit.ts           audit-log table (reserved cross-cutting; logAudit writer → foundation)
│   ├── assets.ts          CAS index (assets domain)
│   ├── character.ts       characters · character_versions · character_personas  (de-pinned)
│   ├── persona.ts         personas  (MOVED out of character.ts — producer-named)
│   ├── chat.ts            chats · messages · message_variants · chat_participants · chat_events
│   │                      · chat_stream_events · chat_injections  (de-pinned; persona columns changed)
│   ├── embeddings.ts      character_embeddings · image_embeddings · chat_digests · chat_segments
│   │                      · chat_digest_speakers  (MOVED out of search.ts — producer-named)
│   ├── discovery.ts       duplicate_pairs · keyword_cooccurrence · character_keyword_profiles
│   │                      · character_summaries · theme_clusters · digest_theme_assignments
│   │                      (RENAMED from corpus.ts)
│   ├── tag.ts             tags + 5 junctions  (character_tags grows status)
│   ├── world-info.ts      world_books · world_entries · 4 scope junctions  (character_books re-keyed)
│   ├── credentials.ts · preset.ts · runtime.ts · sdk-session.ts · sessions.ts
│   ├── settings.ts · stats.ts · workloads.ts · buddy.ts        (one file per producing domain)
└── migrations/
    ├── 0000_baseline.sql  fresh orbweaver baseline (born with every column change below)
    └── meta/_journal.json
```

`Db` (`LibSQLDatabase<typeof schema>`) is exported from `client.ts`; it is the handle every domain's
`context.ts` closes over. `@orb/db/kit/parsers.ts` (RESOLVED home) is the generalization of neo-tavern's
`parseProviderMetadata` pattern — the §8.4 zod-parse-at-the-DB-seam model.

---

## Movement table

Every schema file + db utility → its orbweaver home → rationale → enforcement tier.

| Unit (steady) | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `db/schema/search.ts` — `character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments`, `chat_digest_speakers` | **rename/move** | `@orb/db/schema/embeddings.ts` | The schema-naming LIE: all four primary vector tables + the speaker join were named for the consumer (`search`). The producer is `embeddings` (the one write path). Memory's domain-stamped columns (`chatId`/`scopedCharacterId`/`isGroup`/`tier`) stay on the rows; ownership of the file transfers. | compile-time: old file gone; any import of `db/schema/search` fails `tsc` |
| `character_embeddings.sourceText` (staleness key) | **+`content_hash`; drop `sourceText` as the key** | `@orb/db/schema/embeddings.ts` | Divergence from the other three tables, which gate staleness on `content_hash`. In orbweaver ALL four vector tables have `content_hash`; `embeddings.store` computes it. (`embeddings.md`.) `sourceText` may survive as a debug column, but it is no longer the staleness gate. | compile-time: `content_hash` is in the DDL; `StoreParams.content` drives the hash, no `sourceText` param |
| `image_embeddings` (caption/captionMeta) | **+`lens` column + `(asset, model, lens)` unique index** | `@orb/db/schema/embeddings.ts` | neo-tavern has one row per `(asset, model)` carrying an optional caption. orbweaver embeds TWO lenses per avatar (`image-raw`, `image-captioned`) in the same 1024-dim space → the unique index gains `lens` so both coexist idempotently. (`embeddings.md` source-kinds table.) | compile-time: the unique index DDL; the upsert key is `(assetId, model, lens)` |
| `chat_digests`/`chat_segments`/`character_embeddings`/`image_embeddings` — `hub_score` | **stays a column; never nulled by a write** | `@orb/db/schema/embeddings.ts` | The advisory-stale CSLS column: written ONLY by `discovery` via `embeddings.writeHubScores`, read by `search`. A vector write must NOT null it (the neo-tavern reset-in-3-places bug). | compile-time: `StoreParams` has no `hubScore` field; lint: only `embeddings/persistence` writes the column |
| `chat_digests.characterVersionId` / `chat_segments.characterVersionId` (CASCADE FK to `character_versions`) | **redesigned → provenance stamp** | `@orb/db/schema/embeddings.ts` | Today a chat-pinning artifact (FK to the pinned cv). With de-pin (`character.md`), the column records *which version was current at write time* — provenance, not a pinned-chain FK. By-character corpus scoping resolves through `chat_digest_speakers` (already identity-keyed) + current-version resolution. | compile-time: the FK declaration changes; a migration referencing the old pinned chain fails the FK check |
| `db/schema/character.ts` — `personas` + `character_personas` | **split out** | `personas` → `@orb/db/schema/persona.ts`; `character_personas` stays in `character.ts` | Producer rule: persona rows are owned by the `persona` domain. `character_personas` is the character↔persona junction keyed on `characters.id` (identity, not cv) — it stays with character (the association owner) but the persona table is named for its producer. | compile-time: file move; `tsc` on broken imports |
| `db/schema/character.ts` — `characters.currentVersionId` | **stays** | `@orb/db/schema/character.ts` | Still the live pointer (SET NULL, a bare pointer). De-pin removes the *chat-side* FK into `character_versions`, not this one. | compile-time: column present; the chat-side pin is what's removed |
| `db/schema/character.ts` — `character_versions.proposedTags` (JSON) | **DROP** | — | `tag.md`: proposed becomes a **status** on the junction, not a parallel JSON store. Import/distill write `character_tags` rows with `status='pending'`; the column dissolves. A stranded JSON blob with no schema companion. | compile-time: column absent → any read site is a `tsc` error; migration drops it (after the status backfill) |
| `db/schema/chat.ts` — `chats.characterVersionId` (NOT NULL, CASCADE FK) | **DROP** | `@orb/db/schema/chat.ts` | THE cv-pin. `character.md` de-pin: chats reference live identity, resolve the current version at use. Removing it deletes the entire `cow.ts` CAS dance + `versionPinned` subquery. The `chats_character_version_idx` index drops with it. | compile-time: column absent → every reference fails `tsc`; this is the load-bearing de-pin enforcement |
| `db/schema/chat.ts` — `chats.personaId` (+ `chats_persona_idx`) | **DROP** | `@orb/db/schema/chat.ts` | `persona.md`: the active persona is per-participant (`chat_participants.activePersonaId`), not a chat-level second home that can diverge. `setActivePersona` (persona domain) replaces `setChatPersona`. | compile-time: column absent = read site `tsc` error |
| `db/schema/chat.ts` — `chats.pinnedPersonaId` | **RENAME → `anchorPersonaId`** | `@orb/db/schema/chat.ts` | `persona.md`: the dual-persona rule survives; the anchor is the stable `{{user}}` POV for card-authored sections. Rename makes the role self-documenting (`chats_pinned_persona_idx` → `chats_anchor_persona_idx`). | compile-time: old name absent → all callsites `tsc` error |
| `db/schema/chat.ts` — `chat_participants.activePersonaId` (added-but-unwired) | **wire it (no schema change)** | `@orb/db/schema/chat.ts` | "unwired ≠ worthless" — the column + index + relation already exist; assembly's RESOLVE phase reads it, `setActivePersona` writes it. Pure server-side wiring; the schema is already correct. | test-time + lint: assembly reads it; dep-cruiser routes the write through the persona front door |
| `db/schema/chat.ts` — `messages.personaId` / `characterId` / `authorUserId` | **stays** | `@orb/db/schema/chat.ts` | Per-message attribution (SET NULL FKs). Under first-class principals (§8.6) `authorUserId` stamping becomes a live build, but the columns are right. | — (server wiring concern) |
| `db/schema/corpus.ts` — all 6 rollup tables | **rename + move** | `@orb/db/schema/discovery.ts` | The `corpus`→`discovery` rename (`discovery.md`). Discovery's OWN rollups (a PK that is not an FK to a parent — the subsystem bar). The `centroid` `vector32` column stays a rollup, not a primary vector. | compile-time: file move forces importers; `tsc` flags breakage |
| `db/schema/tag.ts` — `character_tags` | **+`status: 'pending' \| 'accepted'`** | `@orb/db/schema/tag.ts` | `tag.md`: collapses the two-surface (proposed JSON vs accepted junction) design into one junction with a status flip. Import/distill write `pending`; "Accept" flips to `accepted`; export reads `accepted` (closes the round-trip gap). | compile-time: the `status` enum is a typed drizzle column; `proposedTags` (above) drops |
| `db/schema/world-info.ts` — `character_books.cv_id` (FK to `character_versions`) | **re-key → `characters.id` (identity)** (RESOLVED) | `@orb/db/schema/world-info.ts` | `character.md` + `world-info.md` (load-bearing): re-key to `characters.id`; the book-snapshot semantics are re-provided by **current-version resolution** at assemble (the simple default), NOT a snapshot column and NOT a chat-level pin. A future freeze-lore-at-version-X feature would be a separate snapshot junction. | compile-time: the FK column type changes `CharacterVersionId`→`CharacterId`; the old pinned-cv chain is gone post-migration |
| `db/schema/assets.ts` · `credentials.ts` · `preset.ts` · `runtime.ts` · `sdk-session.ts` · `sessions.ts` · `settings.ts` · `stats.ts` · `workloads.ts` · `buddy.ts` | **stays (producer-named, correct)** | `@orb/db/schema/<same>.ts` | Already named for their producing domain; no lie. `sdk-session` vs `sessions` keeps the BFF-session ≠ SDK-chat-session split (§7.1, `_FANOUT-BRIEF.md`). `buddy` may grow first-class-principal columns later (future build). | compile-time: file = type source; resolve-time: db deps kit+contracts (enum tuples import from `@orb/contracts`) |
| `db/schema/users.ts` · `audit.ts` | **stays (reserved cross-cutting)** | `@orb/db/schema/<same>.ts` | `users` is the identity root every owned table FKs into (no single domain); `audit` is the log table (the `logAudit` *writer* → `foundation/observability`, but the table stays in db). | compile-time: file = type source |
| `db/schema/relations.ts` | **stays; UPDATED for de-pin** | `@orb/db/schema/relations.ts` | Reserved cross-cutting drizzle `relations()`. Must drop `chats.characterVersion` + `chats.activePersona` (on the dropped `personaId`) relations, rename `pinnedPersona`→`anchorPersona`, and adjust the digest/segment `characterVersion` relations to the provenance form. | compile-time: a relation referencing a dropped column fails `tsc` |
| `db/schema/index.ts` (barrel) | **stays** | `@orb/db/schema/index.ts` | The source-of-truth barrel; the `db-structure` gate requires every file re-exported (a missing file silently drops its tables). Updated for the new `embeddings.ts`/`persona.ts`/`discovery.ts` files. | lint-time: `db-structure` gate |
| `db/custom-types.ts` — `vector32` | **stays (reserved cross-cutting)** | `@orb/db/custom-types.ts` | The native `F32_BLOB` column codec; consumed by `schema/embeddings.ts` + `schema/discovery.ts` (centroid). It is a db-layer artifact (drizzle `customType`), not a kit primitive. The "#3899 insert caveat" + the 4-byte-alignment `slice()` comment are load-bearing. | resolve-time: lives in db; importers are db schema files only |
| `db/client.ts` (whole) | **stays** | `@orb/db/client.ts` | `createDb` + PRAGMAs + the migration runner + integrity scan + backup + housekeeping. The `LibSqlWrap` seam is the composition-root injection point for the OTel wrapper (`db` can't import `server`). | resolve-time: db deps kit+contracts only; `wrap` is an injected param, not an import of `server/observability` |
| `db/vector-ops.ts` — `VECTOR_TABLES`, `VectorTable`, `clearVectorTable` | **→ UP to `domain/embeddings`** | `domain/embeddings/contract/params.ts` (registry) + `persistence/clear.ts` (helper) | Per `embeddings.md`: the typed table registry + the `DELETE FROM` helper belong to the domain that OWNS the tables, not the db layer. `vector-ops.ts` ceases to exist. The "safe: no DiskANN shadow index" comment carries verbatim. | resolve-time: `db/vector-ops` removed; consumers import the `embeddings` front door |
| `db/insert-chunk.ts` — `rowsPerInsert`, `chunkRows` | **→ `@orb/db/kit`** | `@orb/db/kit/insert-chunk.ts` | The libSQL 32766 bound-variable cap is a libSQL fact; `discovery` (rollups) AND `stats` import it. It can't be a domain-feature (cross-feature share is forbidden); it's a db-layer primitive. | resolve-time: `@orb/db` is a declared dep of `@orb/server`; both consumers import it down |
| `_shared/batch.ts` — `batchStmt`, `batchMany` | **→ `@orb/db/kit`** | `@orb/db/kit/batch.ts` | DB-layer primitive: the cast bridges `Parameters<Db["batch"]>` (a drizzle type) — **cannot be kit-pure** (`reports/shared-dissolution.md` §3). The ~59 inline `BatchItem` casts on the chat send path should wire to this. | resolve-time: needs `Db` from `@orb/db`; lint: `kit-purity` would reject it from `@orb/kit` (drizzle import) |
| `_shared/db-errors.ts` — `isConstraintViolation` | **→ `@orb/db/kit`** | `@orb/db/kit/db-errors.ts` | SQLite/libSQL constraint classifier. neo-tavern walks 1 level of `cause`; orbweaver **unifies** it with credentials' `isCredentialUniqueViolation` into the deeper cause-walk classifier (`reports/shared-dissolution.md` §3). A db-layer concern (driver error shape), no domain knowledge. | resolve-time: db/kit; consumers (`tag`/`character`/`admin`/`buddy` create verbs) import down |
| `_shared/fetch-owned.ts` — `fetchOwned`, `OwnedTable` | **→ `@orb/db/kit`** | `@orb/db/kit/fetch-owned.ts` | The owner-scoped single-row fetch. `OwnedTable` is `SQLiteTable & { id; ownerId }` — **requires drizzle column types**, so it can't be `@orb/kit`-pure (resolves `tag.md`'s open kit-vs-db question). `ownerId` becomes `principal.userId` under §7.1. | resolve-time: db/kit (drizzle types); the predicate lives in ONE place |
| `db/parsers.ts` — `parseStringArray`/`parseStringArrayColumn`/`parseStringMap`/`parseRecord` | **stays (db read-seam)** | `@orb/db/kit/parsers.ts` | The row→view JSON coercion seam (zod `.catch(null)` over `$type<>` columns — the assertion drizzle never validates). Conceptually the DB read boundary; the generic ones (`parseStringArray`) could promote to `@orb/kit/json` if a non-db consumer appears (deferred sub-point — see Resolved decisions). | resolve-time: db/kit; the deliberate `null`-vs-`[]` contract asymmetry is load-bearing — preserve |

---

## Cross-tier composition (who reads `db`)

`@orb/db` is consumed in exactly two sanctioned ways, both **downward** (no `db→server` import ever — a
`db` file importing anything from `@orb/server` is RED at resolve-time, since `db`'s declared deps are
only `kit` + `contracts`):

1. **Server persistence** — every domain's `persistence/` layer + `context.ts` closes over the `Db`
   handle and reads/writes its own tables through the drizzle schema. This is the normal path: a verb
   never touches `@orb/db` directly; only `persistence/` does.
2. **The sanctioned bulk-serializer** — `import` + `export` share ONE serde core that reads `@orb/db`
   schema tables **directly** (not through any domain front door). This is the deliberate exception
   (`character.md` §Movement, `spine/serialization-core.md`): import/export are bulk serializers, not
   CRUD callers, so they read the schema rows directly. Same posture `search` + `discovery` have for the
   vector tables (bulk readers, read-only, no business-logic concern).

A third *read-only-join* pattern is also sanctioned (the "pool.ts pattern", `tag.md`): a domain that owns
a *view* of another domain's junction may read that junction table from `@orb/db` schema directly
(`character/list.ts` reading `character_tags + tags`), as long as the read is ownership-safe. This is a
db-layer consumer pattern, not a cross-feature front-door violation.

What is NOT a `db` consumer: `@orb/client` does not depend on `@orb/db` at all (it gets shapes from
`@orb/contracts` + type-only `@orb/server`). `infra` is below `domain` and is a sealed executor — it does
not read the schema.

---

## Spine intersections

### §7.4 — DB row types are the `db` home (the one-direction rule)

`@orb/db` is the **producer** of exactly one shape kind in the §7.4 table: the **DB row**
(`$inferSelect`/`$inferInsert`). The rule, applied:

- **DB row → `db`** (here), consumed downward by `server` persistence. A domain's `persistence/queries.ts`
  may declare a `CharacterRow = typeof characters.$inferSelect` *locally* (a derived row type, not a
  re-declaration of the column shape — `character.md` §7.4 keeps `CharacterRow` in `persistence/`).
- **Cross-boundary wire → `contracts`** (NOT `db`): the enum *tuples* a column constrains (`TagSource`,
  `ChatApi`/`ChatSource`, `WorldBookRole`, the buddy taxonomy) live in `@orb/contracts`; the drizzle
  column's `enum:[...]` either imports the tuple down or mirrors it under a contract test. `db` deps
  `contracts`, so this import direction is legal.
- **Pure primitive → `kit`** (NOT `db`): the TypeID brands (`CharacterId`, …) come from `@orb/kit/ids`;
  `db` imports them to brand columns. The brand is type-only (SQL is plain `TEXT`), so adding/removing a
  brand is **never a migration** — it is the "brand at the db boundary."
- **domain-internal → that domain's `contract/`** (NOT `db`): params/results/views never live here.

The directionality is physics: `db` can only import `kit` + `contracts` (both below it). A row type
leaking UP (a domain re-declaring a column shape, or a wire schema sneaking into `db`) is the §7.4
`no-inline-types` violation; the gate is dep-cruiser + the cake.

---

## Esoteric / load-bearing (must survive the move)

1. **The F32_BLOB exact-scan note (ANN dropped).** There is no DiskANN/ANN shadow index. At corpus
   scale a full `ORDER BY vector_distance_cos(...) LIMIT k` is sub-millisecond and **EXACT (100% recall)**
   — the DiskANN index was ~50× data bloat for nothing (`search/verbs/core.ts`). Two consequences live in
   `db`: (a) `vector32` stores the raw little-endian Float32 blob (which IS libSQL's on-wire `F32_BLOB`),
   sidestepping the drizzle `sql\`vector32()\`` insert caveat (#3899) — the query vector is wrapped
   `vector32(?)` in the search SQL; (b) `clearVectorTable` (now in `domain/embeddings`) is a plain
   `DELETE FROM` — **safe precisely because there is no shadow graph to poison**. Re-introducing an ANN
   index would break both invariants silently.

2. **The custom-type 4-byte-alignment `slice()`.** `vector32.fromDriver` copies into a fresh aligned
   buffer (`value.slice().buffer`) because the driver may hand back an unaligned subarray view that
   `Float32Array` cannot wrap. Remove the copy and reads corrupt on unaligned rows.

3. **`scopedCharacterId = ''` empty-string sentinel** (`chat_digests`). The SHARED/room bucket uses `''`,
   NOT NULL — because SQLite UNIQUE does not dedupe NULL, so the idempotent upsert key
   `(chatId, scopedCharacterId, tier, blockIdx)` only works with a non-null sentinel. The schema column
   is `notNull().default("")`. Any write path must carry `''` through and MUST NOT coerce it to NULL
   (`embeddings.md` invariant 5). The same sentinel appears in `_FANOUT-BRIEF.md` §9.

4. **The TypeID brand at the db boundary.** `$type<CharacterId>()` etc. are type-only; the SQL is plain
   `TEXT`. So brand changes are not migrations, and `$inferSelect` returns branded ids (no `castId` at the
   row→view seam). `users.id` is **deliberately plain** (`Branded` nanoid, not a prefix-validated TypeID);
   inbound `ownerId`/`userId` FKs inherit that plainness.

5. **`foreign_keys` is per-connection and load-bearing.** SQLite defaults FK enforcement OFF; the schema
   is FK-dense, so `createDb` sets `PRAGMA foreign_keys=ON` AND reads it back, refusing to boot if it
   didn't stick. **`runMigrations` then sets `foreign_keys=OFF` on the CONNECTION** for the duration —
   drizzle's 12-step table rebuild DROPs+recreates tables, and with FKs ON a `DROP TABLE parent` performs
   a silent cascading DELETE on a populated db. The in-file `PRAGMA foreign_keys=OFF` is a no-op (libSQL
   runs the migration as one batched transaction and ignores mid-transaction FK toggles), so the
   connection-level toggle is the only thing that works. `assertReferentialIntegrity`
   (`PRAGMA foreign_key_check`) runs after, catching a rebuild that dropped an FK clause.

6. **The `db-structure` barrel gate.** `schema/index.ts` is the source of truth; a schema file missing
   from it silently drops its tables from `typeof schema` (and thus from migrations). The gate enforces
   both the re-export AND the domain-mirror split.

---

## Invariants (gate candidates)

1. **`db` imports only `kit` + `contracts`.** A `db→server` (or `db→domain`) import is impossible.
   *Enforcement: resolve-time (package deps — physics); dep-cruiser backstop for intra-package.*

2. **Producer names the schema file.** `schema/<feature>.ts` mirrors `domain/<feature>`; no file is named
   for a consumer (no `search.ts` holding embeddings tables).
   *Enforcement: lint-time (`db-structure` gate); compile-time (the file is the type source).*

3. **`chats.characterVersionId` does not exist** (de-pin). Any migration adding it back is a `tsc` error
   at every consumer.
   *Enforcement: compile-time — column absence is a schema fact.*

4. **`chats.personaId` does not exist; the persona is per-participant.** `activePersonaId` on
   `chat_participants` is the live truth; `anchorPersonaId` on `chats` is the stable POV.
   *Enforcement: compile-time — dropped column = read-site `tsc` error.*

5. **All four primary vector tables carry `content_hash`** (the staleness gate) and `hub_score` (advisory,
   never nulled by a write).
   *Enforcement: compile-time — `content_hash NOT NULL` in the DDL; `StoreParams` has no `hubScore` field.*

6. **`character_tags.status` is the single proposed/accepted surface; `character_versions.proposedTags`
   does not exist.**
   *Enforcement: compile-time — dropped JSON column = read-site `tsc` error; the `status` enum is typed.*

7. **The DB row is the one home for column shapes.** No domain re-declares a column shape; no wire schema
   lives in `db`.
   *Enforcement: lint-time (`no-inline-types` / `types-in-contract`); resolve-time (the cake).*

8. **`@orb/db/kit` holds only drizzle-typed primitives.** `batch`/`db-errors`/`fetch-owned`/`insert-chunk`
   stay here precisely because they touch `Db`/`OwnedTable`/the libSQL cap — they would fail `kit-purity`
   in `@orb/kit` (a drizzle import).
   *Enforcement: lint-time (`kit-purity` rejects drizzle imports from `@orb/kit`); resolve-time (they need
   `@orb/db` types).*

---

## Resolved decisions (was: open)

- **Migration ordering — RESOLVED: the rule is ADDITIVE-then-DESTRUCTIVE; the target is a fresh
  `0000_baseline`.** Orbweaver is a ground-up remake, so the fresh baseline is born correct (no
  chat-cv-pin, no `chats.personaId`, `character_tags.status` present, `content_hash` on all four vector
  tables, `character_books` identity-keyed). A neo-tavern **data port is OPTIONAL** (not the default). IF
  a port is done, every transform follows the additive-then-destructive rule: (a) add `content_hash` +
  backfill BEFORE dropping `sourceText` as the staleness key; (b) add `character_tags.status` + migrate
  `proposedTags` JSON → pending junction rows BEFORE dropping `proposedTags`; (c) resolve every dropped FK
  (`chats.characterVersionId`, the digest/segment provenance FKs, the `character_books` cv-key) under the
  12-step rebuild with connection-level `foreign_keys=OFF` + a post-migration `foreign_key_check`; (d) the
  `pinnedPersonaId→anchorPersonaId` `RENAME COLUMN` does NOT rewrite FK clauses (the exact bug
  `assertReferentialIntegrity` catches) — verify the FK survives. Port-vs-fresh is a deployment choice;
  the SEQUENCING rule above is fixed regardless.

- **`character_books` re-key strategy — RESOLVED: `characters.id` (identity) + current-version
  resolution.** No snapshot column in the initial port; the snapshot guarantee is current-version
  resolution at assemble. (Locked with `character.md`, `world-info.md`, `export.md`.) A
  freeze-lore-at-version-X feature, if ever wanted, is a separate snapshot junction.

- **`db/parsers.ts` final home — RESOLVED → `@orb/db/kit/parsers.ts`** (db read-seam, paired with
  `$type<>` columns). *Deferred sub-point:* promote the truly-generic ones (`parseStringArray`) to
  `@orb/kit/json` ONLY if a non-db consumer appears; until then they stay db/kit.

- **`db-errors` unification depth — RESOLVED: the DEEPER (4-depth) cause-walk.** `@orb/db/kit/db-errors`
  unifies `isConstraintViolation` (1-level today), credentials' `isCredentialUniqueViolation` (deeper),
  and the workloads constraint classifiers into ONE classifier that walks `error.cause` 4 levels and
  exposes a "which constraint" discriminator (so domain marker predicates read the discriminator instead
  of re-walking, and a FK-on-`ownerId` violation isn't swallowed as "already active"). Per
  `shared-dissolution.md` §3 + `workloads.md`.

### Still open (deferred, with criteria)

- **`runtime.ts` / `sdk-session.ts` producer — DEFERRED (schema-home confirmation).** Both are
  chat-adjacent telemetry/session-cache tables. *Criterion:* confirm they map to a `runtime`/`chat`
  producing domain at chat-scaffold time, keeping the BFF-session ≠ SDK-chat-session split legible (§7.1).

- **First-class-principal columns on `users`/`buddy` (§8.6) — DEFERRED (future schema build).**
  `users.isAgent`/`kind` + the `buddies.userId` owner-link-vs-own-principal split. Owned by
  `spine/identity-auth-permission.md`; noted here so the `users` reserved file anticipates them. Not in this pass.

## Flagged — cross-doc (not resolved here)

- **`character_summaries` schema home** is `@orb/db/schema/discovery.ts` (producer = discovery; the
  `corpus`→`discovery` rollups). `tag.md` agrees (`character_summaries.tags` are discovery facets, NOT
  tag labels). No contradiction found — flagged only so the knowledge-cluster/discovery QA confirms the
  producer-ownership when those out-of-slice docs are reconciled.
