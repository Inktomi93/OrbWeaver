# Orbweaver — `@orb/db`: the schema floor (drizzle + libSQL + migrations)

> **Status: planning (package survey).** `@orb/db` is the third tier of the cake
> (`kit ← contracts ← db ← server ← client`): the drizzle schema, the libSQL client + PRAGMAs +
> migration runner, the native vector column type, and the db-layer primitives that need drizzle types.
> It sits **below `server`** (server is its only business-logic consumer) and **above `contracts` + `kit`**
> (it imports the TypeID brands from `@orb/kit/ids` and enum tuples from `@orb/contracts`). The DB row
> types (`$inferSelect`/`$inferInsert`) are produced HERE; every domain imports them downward.
> Authoritative upstream: `structure.md` §2 (the cake — `db` deps kit+contracts only), §6 (the
> partitioning rule), §7 (the 13 legibility gates); `_FANOUT-BRIEF.md` §2 (the one-directional hard rule), §3
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
│   ├── assets.ts          CAS index (assets domain) — per-user: `ownerId` + `unique(ownerId,hash)` (D21)
│   ├── character.ts       characters (FLAT — the card content lives here) · character_snapshots (git-commit
│   │                      history blob, nothing FKs it) · character_personas  (character_versions GONE — D28)
│   ├── persona.ts         personas  (MOVED out of character.ts — producer-named)
│   ├── chat.ts            chats · messages · message_variants · chat_participants · chat_events
│   │                      · chat_stream_events · chat_injections · chat_invites · pending_turns · chat_locks
│   │                      (de-pinned; persona columns changed; participant lifecycle + invites + host-offline
│   │                      deferred turns — the unified roster system, `domains/chat.md` Part III + ledger D16.
│   │                      `messages` = pure SLOT + `selectedVariantId`; ALL content/economics live in
│   │                      `message_variants` — D26; `messages.parentId` dropped, fork lineage = `chats.parentChatId` — D27)
│   ├── embeddings.ts      character_embeddings · image_embeddings · chat_digests · chat_segments
│   │                      · chat_digest_speakers  (MOVED out of search.ts — producer-named)
│   ├── discovery.ts       duplicate_character_pairs · duplicate_chat_pairs (per-type FK, D24 — was the
│   │                      polymorphic duplicate_pairs) · keyword_cooccurrence · character_keyword_profiles
│   │                      · character_summaries · theme_clusters · digest_theme_assignments
│   │                      (RENAMED from corpus.ts)
│   ├── tag.ts             tags + 5 junctions  (character_tags grows status; chat_tags grows ownerId — D30 per-user overlay)
│   ├── world-info.ts      world_books · world_entries · 4 scope junctions  (character_books re-keyed)
│   ├── credentials.ts · preset.ts · rate-limit.ts (rate_limit_buckets — producer transport/rate-limit, D35) · sdk-session.ts · sessions.ts (sessions · oidc_transactions)
│   ├── settings.ts · stats.ts · workloads.ts (kind/status derive @orb/contracts/workloads — D34) · buddy.ts        (one file per producing domain)
│   ├── notifications.ts   notifications  (NEW — producer = the `notifications` domain: per-user durable inbox
│   │                      recipientUserId · type · payload · monotonic seq · readAt/dismissedAt; durable-first)
└── migrations/
    ├── 0000_baseline.sql  fresh orbweaver baseline (born with every column change below)
    └── meta/_journal.json
```

> **D37 reconciliation (2026-06-27) — the born-`0000_baseline` + the schema CODE already carry these
> restored columns/indexes; this doc's older movement-table rows predate D37:** `chats.variableValues` +
> `chats.importedFrom`/`importHash`; `message_variants.apiErrorStatus` + `toolCalls` (reserved); `sessions.
> lastSeenAt` + `userAgent`; `unique(characterId, model)` on `character_embeddings`; `unique(ownerId, handle)`
> on `characters`; `audit_logs` actor FK (`set null`) + the 3 hot-path indexes; `hub_score` is `real` on all
> 4 vector tables. (A full per-row movement-table reconciliation remains a focused follow-up; the baseline +
> code + ledger D37 are canonical.)

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
| `image_embeddings` (caption/captionMeta) | **+`lens` column (derives `IMAGE_LENSES`, D34) + `(asset, model, lens)` unique index** | `@orb/db/schema/embeddings.ts` | neo-tavern has one row per `(asset, model)` carrying an optional caption. orbweaver embeds TWO lenses per avatar (`image-raw`, `image-captioned`) in the same 1024-dim space → the unique index gains `lens` so both coexist idempotently. The `lens` column derives **`IMAGE_LENSES` from `@orb/contracts/embeddings`** (D34 — promoted out of the server tier so db can CHECK + test-mirror it; the broader `SourceLens` incl. text lenses stays a domain concern). (`embeddings.md` source-kinds table.) | compile-time: the unique index DDL + the `lens` CHECK; the upsert key is `(assetId, model, lens)` |
| `chat_digests`/`chat_segments`/`character_embeddings`/`image_embeddings` — `hub_score` | **stays a column; never nulled by a write** | `@orb/db/schema/embeddings.ts` | The advisory-stale CSLS column: written ONLY by `discovery` via `embeddings.writeHubScores`, read by `search`. A vector write must NOT null it (the neo-tavern reset-in-3-places bug). | compile-time: `StoreParams` has no `hubScore` field; lint: only `embeddings/persistence` writes the column |
| `chat_digests`/`chat_segments`/`character_embeddings` — `ownerId` + `owner_idx` | **DROP (ledger D20)** | `@orb/db/schema/embeddings.ts` | neo stamps a denormalized `ownerId` here ("*Mirrors chats.ownerId … avoid a join*") — a doubling, and D18 removed `chats.ownerId` (nothing left to mirror). A vector row carries only its **producer FK** (`chatId`/`characterId`/`assetId`, all NOT NULL); owner-scope is DERIVED at search time from the producer (membership `chatId ∈ {my chats}` for digests/segments; `characters.ownerId` for character embeds; caller's asset-usage for images). Correct-by-construction on host-handoff (no stale stamp), one home, no cross-user leak (the scope is the producer's live ownership, applied in the one `search` engine before rank/collapse). `image_embeddings` has no `ownerId` either — owner-scope derives via its (now per-user, D21) owned asset. | compile-time: column absent → `StoreParams` has no `ownerId`; lint: `vector-scope-derived` (no raw vector read outside `search`; scope mandatory + before collapse) |
| `character_summaries`/`character_keyword_profiles` (discovery) · `character_stats` (stats) · `digest_theme_assignments` (discovery) — `ownerId` + `owner_idx` | **DROP (ledger D23)** | `@orb/db/schema/discovery.ts` · `schema/stats.ts` | The ownership-stamp rule applied to the derived rollups: each has a single owning-entity parent, so its owner is reachable by one FK and the `ownerId` is a redundant mirror. `character_summaries`/`_keyword_profiles`/`character_stats` → the **character** (`characterId`/cv → `characters.ownerId`); `digest_theme_assignments` → the **digest** (→ chat → host). Owner-scope derives at read time (character-keyed → `characterId ∈ {my characters}`; digest-keyed → host membership). **KEEP `ownerId`** on the parentless per-user aggregates — `owner_stats`/`daily_stats`/`model_stats`/`theme_clusters`/`keyword_cooccurrence` (owner × a non-entity dimension; no owning-entity parent → `ownerId` is their own key, not a mirror). **`duplicate_*_pairs` DERIVE** (NOT kept) — D24 modernizes the polymorphic `duplicate_pairs` into per-type FK tables (`duplicate_character_pairs`/`duplicate_chat_pairs`), which makes the owner reachable by one FK, so the `ownerId` drops (the polymorphism was hiding the parent — which is why an earlier pass mis-filed it as a parentless KEEP). | compile-time: column absent on the derived rows; lint: discovery/stats reads derive owner via the parent FK, never a stamped column |
| `chat_digests.characterVersionId` / `chat_segments.characterVersionId` (CASCADE FK to `character_versions`) | **DROPPED (D28 — no cv exists)** | `@orb/db/schema/embeddings.ts` | `character_versions` is gone (D28), so there is no cv to stamp. The "detangle chat_digests": digests/segments key on `chatId`; by-character identity is `chat_digest_speakers` (identity-keyed); staleness is `content_hash`. (Supersedes the D25 "provenance-stamp, confirm-or-drop" flag — it's dropped.) | compile-time: column absent → any reference fails `tsc` |
| `db/schema/character.ts` — `personas` + `character_personas` | **split out** | `personas` → `@orb/db/schema/persona.ts`; `character_personas` stays in `character.ts` | Producer rule: persona rows are owned by the `persona` domain. `character_personas` is the character↔persona junction keyed on `characters.id` (identity, not cv) — it stays with character (the association owner) but the persona table is named for its producer. | compile-time: file move; `tsc` on broken imports |
| `db/schema/character.ts` — `character_versions` (whole table) + `characters.currentVersionId` + the circular FK | **DROP — flatten (D28)** | `@orb/db/schema/character.ts` | `character_versions` is GONE. The flat `characters` row is `{id, handle, ownerId, starred, archived, synthetic, forbidExternalMedia, importedFrom, importHash, contentHash, createdAt}` **+ all card content** (name/description/personality/scenario/greetings/exampleMessages/systemPrompt/postHistoryInstructions/depthPrompt/creatorNotes/creator/cardVersion/regexScripts/extensions/avatarAssetId/refinery*) — the card IS the live identity row. (`importHash`/`importedFrom` are the re-import dedup keys — sha-256 of the imported file + its source; `contentHash` is the semantic-fields hash, a distinct value — see `serialization-core.md`.) `currentVersionId` + the circular FK + the `version` counter + `cow.ts` + `resolveCurrentVersion` all vanish. | compile-time: `character_versions` gone → every cv reference fails `tsc`; `cow.ts` deleted |
| `db/schema/character.ts` — `character_snapshots` | **NEW (D28 — git-commit history)** | `@orb/db/schema/character.ts` | Append-only history: `{id, characterId (FK characters, CASCADE), content (JSON = full card snapshot), label?, createdAt}`. **NOTHING FKs it** (not chats/digests/books/embeddings) — it's opaque history, browse + restore-in-place only (restore copies the blob → `characters`, snapshot-current-first). ONE JSON blob (NOT a parallel set of typed columns — no re-cloning the card schema). | compile-time: typed table; lint: no FK from any other table TO `character_snapshots` |
| `db/schema/character.ts` — `character_versions.proposedTags` (JSON) | **DROP** | — | `tag.md`: proposed becomes a **status** on the junction, not a parallel JSON store. Import/distill write `character_tags` rows with `status='pending'`; the column dissolves. A stranded JSON blob with no schema companion. | compile-time: column absent → any read site is a `tsc` error; migration drops it (after the status backfill) |
| `db/schema/chat.ts` — `chats.characterVersionId` (NOT NULL, CASCADE FK) | **DROP** | `@orb/db/schema/chat.ts` | THE cv-pin. `character.md` de-pin: chats reference live identity, resolve the current version at use. Removing it deletes the entire `cow.ts` CAS dance + `versionPinned` subquery. The `chats_character_version_idx` index drops with it. | compile-time: column absent → every reference fails `tsc`; this is the load-bearing de-pin enforcement |
| `db/schema/chat.ts` — `chats.personaId` (+ `chats_persona_idx`) | **DROP** | `@orb/db/schema/chat.ts` | `persona.md`: the active persona is per-participant (`chat_participants.activePersonaId`), not a chat-level second home that can diverge. `setActivePersona` (persona domain) replaces `setChatPersona`. | compile-time: column absent = read site `tsc` error |
| `db/schema/chat.ts` — `chats.pinnedPersonaId` | **RENAME → `anchorPersonaId`** | `@orb/db/schema/chat.ts` | `persona.md`: the dual-persona rule survives; the anchor is the stable `{{user}}` POV for card-authored sections. Rename makes the role self-documenting (`chats_pinned_persona_idx` → `chats_anchor_persona_idx`). | compile-time: old name absent → all callsites `tsc` error |
| `db/schema/chat.ts` — `chats.sessionId` + `chats.sessionDirty` | **DROP — agent-sdk backend state (ledger D25)** | `@orb/db/schema/sdk-session.ts` (the session store owns it) | These are agent-sdk session-cache state stamped on the chat row; the session extraction (chat.md #3 / D8) makes the chat domain stateless, so they leave the table too. The session lineage + reseed-when-stale live in `session_entries` (keyed by `chatId`); staleness is detected vs canon, not a `chats` flag. **`chats.compactSummary` + `chats.compactedAtSeq` STAY** (portable compaction checkpoint — the stateless OpenRouter runner uses them too; chat canon, not session state). | compile-time: columns absent from `chats`; the agent-sdk backend reads `session_entries`, never `chats.sessionId` |
| `db/schema/chat.ts` — `chats.ownerId` (NOT NULL, `onDelete:restrict` FK to users) | **DROP — chats are MEMBERSHIP-scoped (ledger D18)** | `@orb/db/schema/chat.ts` | A chat is not single-owned in the group model. The host = `chat_participants(role='host')` is the one home (authority + the `runAsUserId`/funding source + the host-only-search scope, derived from membership not a stamped digest `ownerId` — D20). `loadOwnedChat`/owner-equality → `loadMemberChat`/`requireParticipant`; "list my chats" is pure membership; user hard-delete cascades `chat_participants` (not blocked by an `onDelete:restrict` FK); a host-orphaned room → the terminal archive/force-reassign state. Chats leave the `OwnedTable`/`fetchOwned` pattern (membership-scoped, not single-owned). | compile-time: column absent → every owner-equality read fails `tsc`; the chat domain uses `loadMemberChat`, never `fetchOwned` |
| `db/schema/chat.ts` — `chat_participants.activePersonaId` (added-but-unwired) | **wire it (no schema change)** | `@orb/db/schema/chat.ts` | "unwired ≠ worthless" — the column + index + relation already exist; assembly's RESOLVE phase reads it, `setActivePersona` writes it. Pure server-side wiring; the schema is already correct. | test-time + lint: assembly reads it; dep-cruiser routes the write through the persona front door |
| `db/schema/chat.ts` — `chat_participants` group/lifecycle columns | **ADD (baseline, born whole — ledger D16)** | `@orb/db/schema/chat.ts` | The unified roster (`domains/chat.md` Part III §1): `role` (`host\|member`), `talkativeness` (real, default 0.5), `disabled`, `joinedAt`, `joinSeq`, `leftSeq`, `joinHistoryVisibility` (`from-join\|full`, default `from-join`), the **`(chatId,userId)` UNIQUE** + the **XOR CHECK `(user_id IS NULL) <> (character_id IS NULL)`** (both free at table creation). Re-add = the guarded `ON CONFLICT(chatId,userId) DO UPDATE joinSeq=<current>, leftSeq=NULL WHERE leftSeq IS NOT NULL`; lifecycle seqs live in `messages.seq` (not the stream cursor); `characterId` keys on `characters.id` (identity, de-pin). | compile-time: typed columns + CHECK/UNIQUE at creation; lint: the membership chokepoint reads them |
| `db/schema/chat.ts` — `messages` (the SLOT) | **de-clone (D26)** | `@orb/db/schema/chat.ts` | `messages` keeps ONLY slot + attribution + selection: `id, chatId, seq, role, personaId, characterId, authorUserId, selectedVariantId (FK message_variants), excludedFromPrompt, createdAt, editedAt`. **DROP from `messages`:** `content`, `reasoning`, all economics (`tokens*`/`cache*`/`costUsd`/`contextWindow`/`maxOutputTokens`/`ttftMs`/`terminal*`/`finish*`/`stop*`), `params`, `reasoningEffort`, `genStarted/Finished`, `rawRequest/rawResponse`, `promptSnapshot`, `model/provider`, the continue-undo columns, `activeVariantIdx` (→ `selectedVariantId` FK), `metadata` (gen sidecar). Attribution is **slot-level** (a swipe never changes the speaker — supersedes the prior `message_variants` attribution add). | compile-time: `messages.content` gone → every reader joins the selected variant; `tsc` flags content-on-message |
| `db/schema/chat.ts` — `message_variants` (the GENERATION record) | **absorbs all content (D26)** | `@orb/db/schema/chat.ts` | Holds everything per-generation: `id, messageId (FK CASCADE), idx, content, reasoning, model, provider, reasoningEffort, tokens*, cache*, costUsd, contextWindow, maxOutputTokens, ttftMs, terminal/finish/stop, params (UserIntent), genStarted/Finished, rawRequest/rawResponse, promptSnapshot, the continue-undo state (preContinue*/lastContinuation* + reasoning twins), metadata, createdAt`. Every message has ≥1 variant (user/system = 1); `selectVariant` flips `messages.selectedVariantId` (no copy). NO `characterId`/`authorUserId` here — attribution is the slot's. | compile-time: per-swipe `promptSnapshot` now exists; the message↔variant content clone is gone |
| `db/schema/chat.ts` — `messages.parentId` (self-FK, "raw-mode branching", unwired) | **DROP (D27)** | `@orb/db/schema/chat.ts` | One branch axis only: chat forks (`chats.parentChatId`). The reserved message-level branch axis is removed (never used). | compile-time: column gone |
| `db/schema/chat.ts` — `chats.parentChatId` (self-FK, SET NULL) + `forkedAt` | **stays (fork lineage, D27)** | `@orb/db/schema/chat.ts` | A fork is a COPY (independent membership-scoped chat); `parentChatId` is the lineage pointer (SET NULL → fork survives parent delete as a root); the lineage walk is membership-gated (D18 — a fork grants no parent read). | compile-time: column present; lint: lineage walkers `requireParticipant` per ancestor |
| `db/schema/embeddings.ts` — `character_embeddings.characterVersionId` | **DROP (D28 — no cv)** | `@orb/db/schema/embeddings.ts` | `character_versions` is gone; a character embedding FKs `characters.id` (the live card). | compile-time: column absent |
| `db/schema/chat.ts` — `chat_invites` | **NEW (baseline)** | `@orb/db/schema/chat.ts` | Membership invites (Part III §2): `token` (CSPRNG ≥128-bit, STORED HASHED, constant-time lookup — mirrors `sessions` token discipline), `maxUses`, `expiresAt`, `invitedUserId?` FK, `status` (`pending\|accepted\|declined\|revoked\|expired`). Redeem = atomic conditional `UPDATE … WHERE remaining>0 AND not-expired RETURNING` (maxUses TOCTOU). chat is the producer (membership is chat's). | compile-time: typed table; test: N concurrent redeems of maxUses=K insert exactly K |
| `db/schema/chat.ts` — `pending_turns` | **NEW (baseline)** | `@orb/db/schema/chat.ts` | Host-offline deferred AI turn (Part III §5): `triggeredBy` + the authorized host id; **NOT lock-held** (the 5-min lock TTL would stale-takeover → double-run); boot-reclaimed (like `reclaimChatLocksOnBoot`) + re-validated for consent/budget at drain. | compile-time: typed table; test: boot drains + re-validates |
| `db/schema/notifications.ts` — `notifications` | **NEW (baseline; NEW producing domain)** | `@orb/db/schema/notifications.ts` | The per-user durable inbox (Part III §3; producer = the `notifications` domain): `recipientUserId` FK, `type`, `payload`, monotonic `seq`, `readAt`/`dismissedAt`. **Durable-first** (INSERT in the membership-transition tx; emit after commit) so offline invites/kicks/handoffs survive. The stream adopts the `chat.streamMessages` resume shape, NOT `buddy.stream`. | compile-time: file = type source; `db-structure` requires it in the barrel + the `notifications` domain |
| `db/schema/chat.ts` — `chats.metadata` (group-config / room-overrides JSON) | **typed JSON column (baseline)** | `@orb/db/schema/chat.ts` | The per-chat room-behavior blob (`GroupConfig`/`RoomOverrides`/`OpeningPolicy` — `@orb/contracts/chat`), lazy-parsed (a malformed sub-blob falls back to default without nuking siblings). Per-CHAT (room property), seeded from `userSettings.groupDefaults`. | compile-time: `parseChatMetadata` (chat domain) over the column |
| `db/schema/corpus.ts` — all 6 rollup tables | **rename + move** | `@orb/db/schema/discovery.ts` | The `corpus`→`discovery` rename (`discovery.md`). Discovery's OWN rollups (a PK that is not an FK to a parent — the subsystem bar). The `centroid` `vector32` column stays a rollup, not a primary vector. | compile-time: file move forces importers; `tsc` flags breakage |
| `db/schema/corpus.ts` — `duplicate_pairs` (polymorphic: `entity_type` + untyped `entity_id_a/b`, NO FK) | **modernize → per-type FK tables (ledger D24)** | `@orb/db/schema/discovery.ts` — `duplicate_character_pairs` (FK `characters` ×2, CASCADE) + `duplicate_chat_pairs` (FK `chats` ×2, CASCADE) | No polymorphic association tables in orbweaver. Real FKs + CASCADE replace neo's hand-rolled orphan-GC sweep; entity refs are typed; owner becomes derivable (so `ownerId` is dropped per D23 — DERIVE). Matches the tag-junction per-type-FK precedent + the FK-enforced constitution. `cslsScore`/`similarity`/`model`/`computedAt` carry over per table; **`relation`(`duplicate\|forked`) is ONLY on `duplicate_chat_pairs`** (chats have fork lineage — `parentChatId`, D27; characters don't — snapshots, D28 — so a character pair is always a `duplicate` and carries no `relation` column; D37). The `relation` axis derives `RELATIONS` from `@orb/contracts/discovery` (D34). | compile-time: two typed tables with real FKs; the polymorphic `entity_type`/`entity_id` columns are gone; no orphan-sweep needed (CASCADE) |
| `db/schema/tag.ts` — `character_tags` | **+`status: 'pending' \| 'accepted'`** | `@orb/db/schema/tag.ts` | `tag.md`: collapses the two-surface (proposed JSON vs accepted junction) design into one junction with a status flip. Import/distill write `pending`; "Accept" flips to `accepted`; export reads `accepted` (closes the round-trip gap). | compile-time: the `status` enum is a typed drizzle column; `proposedTags` (above) drops |
| `db/schema/tag.ts` — `chat_tags` | **+`ownerId` (FK users) + `unique(chatId, tagId, ownerId)` — D30** | `@orb/db/schema/tag.ts` | `tag.md`/D30: chat tags are a **per-user overlay**. The target `chats` has no `ownerId` (D18), so the owner is not derivable — the junction KEEPS its own `ownerId` (the tagger) per the D23 "no derivable owner → keep" rule. The ONE tag junction with an `ownerId` (the other four derive from the owned target); membership-gated (`requireParticipant`), each member sees only their own tags. | compile-time: `chat_tags.ownerId: UserId` typed column; the junction registry's `scope:'membership'` branch types it separately from the four target-derived junctions |
| `db/schema/world-info.ts` — `character_books.cv_id` (FK to `character_versions`) | **re-key → `characters.id` (D28 — no cv exists)** | `@orb/db/schema/world-info.ts` | `character_versions` is gone (D28), so `character_books` keys on `characters.id` (live identity) — there is no cv chain and no book-snapshot semantics to re-provide (the card is the live row). A future freeze-lore-at-a-snapshot feature, if ever wanted, would reference `character_snapshots`, not a cv. | compile-time: the FK column type is `CharacterId`; any `CharacterVersionId` reference fails `tsc` |
| `db/schema/assets.ts` — `assets` | **+`ownerId` (FK users) + `unique(ownerId, hash)` — per-user (ledger D21)** | `@orb/db/schema/assets.ts` | Reverses neo's global+hash-deduped+no-`ownerId` model. Assets join the single-owned category (`ownerId`/`fetchOwned`); `unique(ownerId, hash)` (was a bare global `hash.unique()`); within-user dedup only. The `/blob/:hash` route becomes owner-gated (app-served via the session cookie; one roster-avatar membership exception); the CAS is per-user keyed. Image embeddings owner-scope derives from the now-owned asset (D20). | compile-time: `ownerId` column + the composite unique; lint: blob route resolves the caller, never serves on bare row-existence |
| `db/schema/credentials.ts` · `preset.ts` · `rate-limit.ts` · `sdk-session.ts` · `sessions.ts` · `settings.ts` · `stats.ts` · `workloads.ts` · `buddy.ts` | **stays (producer-named, correct)** | `@orb/db/schema/<same>.ts` | Already named for their producing domain; no lie. `rate-limit.ts` (producer `transport/rate-limit`, D35) replaces the dropped placeholder `runtime.ts`. `sdk-session` vs `sessions` keeps the BFF-session ≠ SDK-chat-session split (§7.1, `_FANOUT-BRIEF.md`). `buddy` may grow first-class-principal columns later (future build). | compile-time: file = type source; resolve-time: db deps kit+contracts (enum tuples import from `@orb/contracts`) |
| `db/schema/users.ts` · `audit.ts` | **stays (reserved cross-cutting)** | `@orb/db/schema/<same>.ts` | `users` is the identity root every owned table FKs into (no single domain); `audit` is the log table (the `logAudit` *writer* → `foundation/observability`, but the table stays in db). | compile-time: file = type source |
| `db/schema/users.ts` — `users.role` enum | **`owner \| admin \| user`** (was `admin \| user`) | `@orb/db/schema/users.ts` | The server-owner role split (ledger D17): `owner` = the box owner (sole `max-pro-sub`/wallet holder; grants/revokes admin; immutable, exactly one); `admin` = delegated; `user` = normal. The drizzle enum **derives** the `USER_ROLES` tuple from `@orb/contracts/identity` (§7.5 one-home; test-mirror). | compile-time: enum derives the tuple; test: db enum mirrors `USER_ROLES` |
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

5. **All four primary vector tables carry `content_hash`** (the staleness gate) and `hub_score` (advisory
   `real` — `integer→real` corrected per D37 (CSLS mean-cosine float); never nulled by a write).
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

- **`runtime.ts` / `sdk-session.ts` producer — RESOLVED (D35).** `runtime.ts` is DROPPED — the only
  concrete table it would have held, `rate_limit_buckets`, now lives in **`schema/rate-limit.ts`**
  (producer `transport/rate-limit`, natural-key PK). `sdk-session.ts` is `session_entries` (D8 — agent-sdk
  prompt-cache lineage keyed by `chatId`). The BFF-session ≠ SDK-chat-session split stays legible (§7.1).

- **First-class-principal columns on `users`/`buddy` (§8.6) — DEFERRED (future schema build).**
  `users.isAgent`/`kind` + the `buddies.userId` owner-link-vs-own-principal split. Owned by
  `spine/identity-auth-permission.md`; noted here so the `users` reserved file anticipates them. Not in this pass.

## Flagged — cross-doc (not resolved here)

- **`character_summaries` schema home** is `@orb/db/schema/discovery.ts` (producer = discovery; the
  `corpus`→`discovery` rollups). `tag.md` agrees (`character_summaries.tags` are discovery facets, NOT
  tag labels). No contradiction found — flagged only so the knowledge-cluster/discovery QA confirms the
  producer-ownership when those out-of-slice docs are reconciled.
