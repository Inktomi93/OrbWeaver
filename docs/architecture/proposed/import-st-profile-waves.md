---
kind: spec
status: draft
updated: 2026-07-10
---

# Import — the ST-profile waves (PD-77 + PD-78): chats · personas · lorebook · loader · backfill

> **PARTIAL BUILD (2026-07-10) — the PURE FOUNDATION landed; the DB-integration waves remain.**
> BUILT + test-pinned (the load-bearing parser esoterica, all pure / zero-I/O):
> - `domain/import/substrate/chat.ts` — `parseChatJsonl` + `parseStDate` + `buildVariants` (empty-swipe
>   drop + active-index remap) + the `ChatBucket` classifier (esoterica 1 filename-date-wins + 3
>   empty-swipe-drop carried verbatim). Test: `tests/server/domain/import/substrate/chat.test.ts`.
> - `domain/import/substrate/persona.ts` — `parseStPersonas` + the ST position→placement normalization
>   (`@orb/kit/persona` + the message-role bimap). Test: `.../substrate/persona.test.ts`.
> - `#kit/serde/card` — the lorebook IN serde co-located next to the OUT half: `extractLorebook` /
>   `selectBestCharacterBook` / `loreEntryColumns` / `loreEntryMetadata` (`constant→scopeMode:always`;
>   `extensions.{position:4,depth,role}→inject`). Byte-identical round-trip pinned in
>   `tests/server/kit/serde/card/index.test.ts`. (Resolves the §"lorebook wave" OPEN — co-located, NOT a
>   split world-entry module.)
> - `domain/import/contract/views.ts` — the parser return contracts (`ParsedChat`/`ParsedChatMessage`/
>   `ParsedVariant`/`ChatBucket`+`CHAT_BUCKETS` tuple/`ParsedPersona`/`ParsedPersonas`/`CollectResult` +
>   the `CollectedCard`/`CollectedChat`/`CollectedPersona`/`ImportPersonaInput`/`ImportChatsInput` shapes).
>
> BUILT (2026-07-10, the domain CORE — RULING A: ONE `ImportContext`, gaining an OPTIONAL `profile`
> bundle carrying the `db` handle + clock + minters + `personaByUserName` + the PD-78 ops; the card verbs
> read NONE of it, so the card slice + its harness are unchanged):
> - `persistence/chat-writer.ts` — the D26 slot⋈variant 3-step writer + inline founding roster (chat's
>   roster.ts row shape — import can't sideways-import chat) + branch resolution (pass-2, character-seat
>   scoped) + esoterica 2 (`updatedAt = Math.max(send_dates)`) + 4 (`importHash` dedup pre-fetch + mid-loop).
>   ONE `db.batch` per chat; `db.transaction()` banned.
> - `verbs/import-chats.ts` (ownership gate → chat-writer → PD-78 backfill enqueue on `real_conversation`) +
>   `verbs/import-personas.ts` (dedup-by-name, populates `personaByUserName`). `require-profile.ts` guards the
>   profile deps. Wired into `service.ts`. Int-tests: `tests/server/domain/import/verbs/import-{chats,
>   personas}.int.test.ts` (chats→messages→variants+roster+branch+dedup+backfill-gate; persona dedup+attribution).
> - `loader/collect.ts` (`collectBundlesFromDir` — slug pairing, collision disambig, `IMPORT_SKIP_CHARACTERS`,
>   fuzzy pairing; I/O via the injected `ImportFsPort` — `node:fs`/`node:path` stay at the composition tier).
>   The port TYPE lives in `contract/views.ts` (the type-home gate forbids `loader/fs-port.ts` holding an
>   exported type — the file was dropped; the node impl is built at `entry/`).
> - `contract/{views,results,service}.ts` grew the profile contracts + `ImportProfileDeps` + the PD-78 op types.
>
> STILL UNBUILT (the ENTRY-composition wave + the lorebook writer — the `FLAG[PD-77]`/`FLAG[PD-78]` markers in
> `run-profile-import.ts` / `runner-env.ts` STAY until these land):
> - the `run-profile-import.ts` driver extension (personas-first → `collectBundlesFromDir` → per-character
>   store→`importCharacter`→`importChats` → inline `reconcileStats`) + the `env.import.importAll` bind
>   (runner-env.ts + threading character/assets/tag/persona/workloads.start into the runner-env at services.ts)
>   + the real `ImportFsPort` (`node:fs`) at `entry/`. The PROFILE-DIR SOURCE is the deferred delivery layer
>   (#104 — zip/upload/onboarding); `importAll` binds once a dir trigger exists.
> - `persistence/lorebook-writer.ts` — the `world_books`/`world_entries`/`character_books` write (the IN serde
>   `extractLorebook`/`loreEntryColumns`/`loreEntryMetadata` is BUILT + round-trip-pinned; only the DB write +
>   its driver step remain). Independent of chats/personas/backfill (character-embedded WI).

> **Status: unbuilt design (blocked:later).** Carved out of the gutted `domains/import.md` when the
> built card slice went code-is-truth. The BUILT surface — `parseCardPng`/`parseCardJson` →
> tolerant-normalize → `createCharacterSchema` validate → `importHash` dedup → avatar store →
> create-with-provenance (PD-43 landed) → card tags as `character_tags` `status:'pending'` rows — is
> documented by `packages/server/src/domain/import/` + `packages/server/src/entry/import/run-profile-import.ts`
> headers + tests (40 across 4 suites). The shared serde core is BUILT: `#kit/serde/card`
> (`cardFromJson`/`cardContentHash`/`buildCardV3`/`exportBookEntry`), `@orb/kit/png-card-chunk`,
> `@orb/kit/message-role` (D32), `@orb/contracts/character` — one home each, round-trip test-pinned.
> Registry rows: **PD-77** (loader + `importChats`/`importPersonas`), **PD-78** (`reconcileStats`/
> `enqueueBackfill` context wiring). The inert seams already exist: `entry/compose/runner-env.ts`
> (`import.importAll → notBuilt(…)`), the `import-st` runner
> (`packages/server/src/domain/workloads/runners/import-st.ts`), and the `memory-backfill` workload
> kind + runner. Build against the CURRENT code — the card slice took the injected-op route
> (`ImportContext` has ZERO db access), not the doc's old direct-writer shape.

## PD-77 — the chats / personas / lorebook / loader waves

### What lands (the 8-slot completion)

- `verbs/import-chats.ts` (loose JSONL into an existing character; throws `DomainNotFoundError` —
  re-export it in `contract/errors.ts` with this verb) · `verbs/import-personas.ts`
  (`settings.json` personas; MUST run before the chat importers).
- `substrate/chat.ts` (`parseChatJsonl` + `parseStDate` + the `ChatBucket` classifier) ·
  `substrate/persona.ts` (`parseStPersonas` + ST position normalization) — pure, zero I/O, same
  null-on-unparseable contract as `substrate/card.ts`.
- `persistence/chat-writer.ts` — the chats→messages→variants writer + branch resolution.
- `loader/collect.ts` + `loader/fs-port.ts` — the profile-dir collector.
- `contract/views.ts` — the parser return contracts (`ParsedChat`/`ParsedChatMessage`/
  `ParsedVariant`/`ChatBucket`/`ParsedPersona`/`ParsedPersonas`/`CollectResult`), re-exported from
  the front door for the driver + tests.
- `ImportContext` grows `personaByUserName` (cross-verb attribution state: `importPersonas`
  populates it; the chat writer reads it to attribute each imported chat's `user_name` to the
  persona the user RP'd as) + the PD-78 ops below. No `emit` op — `character.create` already emits
  `character.updated` (the built mechanism; import composes it via the injected create op).

### Chat parser esoterica (load-bearing — carry verbatim into the wave)

1. **`parseStDate` — the filename date wins.** ST re-save/migration rewrites header + every message
   date to the migration time; the chat's TRUE creation date survives ONLY in the filename token.
   Parse the filename FIRST, then header `create_date`, then null — else every migrated chat
   collapses onto its migration date.
2. **`updatedAt` = `Math.max(send_dates)`, not import `now`.** Stamping `now` piles the whole corpus
   at the top of the recent-chats feed; `Math.max`, not last-in-order — ST send_dates are
   non-monotonic.
3. **`buildVariants` drops empty swipe slots + remaps the active index.** Real corpora leave empty
   strings IN the swipe pool (aborted generations); drop, re-index 0..k, remap `swipe_id` onto the
   survivors; `mes` (rendered content) is authoritative regardless.
4. **`chats.importHash` (file bytes) is the per-chat dedup oracle** — pre-fetched in ONE query AND
   updated mid-loop (two byte-identical files in one run both skip).
5. The `ChatBucket` classifier's `real_conversation` bucket is the memory-backfill gate (PD-78).

### The chat writer (D28 + §8.6)

- Keys chats + branch resolution on `characters.id` (no version table exists — D28).
- Builds `chat_participants` roster rows against `@orb/db` DIRECTLY (the sanctioned bulk-serializer
  write, same exemption export's reads use) — the row shape is chat's
  `persistence/roster.ts` contract (the `kind` split + `authorUserId`, §8.6); imported chats are
  owner-authored (no agent principal at import time).
- Persona stamping: `chats.anchorPersonaId` (built column; there is no `chats.personaId`) +
  per-message attribution `personaId`; active-persona lives on `chat_participants`.
- **Atomicity invariant (gate candidate):** each character and each chat commits as ONE atomic
  libSQL `db.batch`; `db.transaction()` is banned (`:memory:` trap). Enforce: `no-db-transaction`
  lint + a kill-mid-import test asserting no half-written character.

### The lorebook wave (the IN half of the WI-entry serde)

- `extractLorebook` (entries are dict-OR-list in the wild) + `selectBestCharacterBook`
  (most-NAMED-entries wins when a card embeds a book twice) — today `cardFromJson` deliberately
  DROPS the embedded lorebook (junction, not a card column); this wave reads it off the raw card
  (same pattern as the built `extractCardTags`).
- `loreEntryColumns`/`loreEntryMetadata` (IN): derive `scopeMode:"always"` from ST's
  `constant: true` (the runtime reads `scopeMode`, not `constant` — a keyed constant entry would
  otherwise silently demote to keyword scope); `extensions.{position:4,depth,role}` →
  `metadata.inject` (role via the `@orb/kit/message-role` bimap). `exportBookEntry`
  (`#kit/serde/card`, PD-44) is the exact inverse — pin the byte-identical round-trip with a test.
- **Open (decide at build):** the old spec homed the pair in a `#kit/serde/world-entry` module; the
  OUT half landed co-located in `#kit/serde/card` instead. Co-locate the IN half there or split the
  world-entry module out — either way ONE home, both directions adjacent.
- Writes land as `world_books`/`world_entries`/`character_books` keyed on `characters.id` (D28).

### The personas wave

- `parseStPersonas`: ST position constants (`ST_IN_PROMPT=0`…`ST_NONE=9`) map to
  `PersonaDescriptionPosition` (`@orb/kit/persona`); the role via `@orb/kit/message-role`. The
  normalization is import-local (a distinct axis, not the message-role union).

### The loader wave

- `collectBundlesFromDir`: pure pairing logic — pairs cards to chat dirs by `slugifyHandle`
  (`@orb/kit/slug`, built), deterministic filename-sorted collision disambiguation, the curation
  skip-list (drops a card AND its chats), and the second-chance fuzzy pairing (trailing-digit +
  `main_<Name>_spec_vN` decorations) — each recorded in `CollectResult` (never silent, operator-
  auditable).
- I/O is INJECTED: `readdir`/`readFile`/`stat` come through `loader/fs-port.ts`; `node:fs` lives at
  the composition tier. Gate candidates: `substrate-no-io` + `domain-no-node-fs`.
- **PD-94 ties in:** the zip loader must land WITH the assets `store` `maxBytes` bound (the
  zip-extract path sniffs magic AFTER the read — without the bound a zip-bomb entry buffers
  unbounded).
- `IMPORT_SKIP_CHARACTERS` (`foundation/env`, built) is the skip-list source.

### The full-profile driver + `import-st`

- `entry/import/run-profile-import.ts`'s card loop grows to the outer driver: personas-first →
  `collectBundlesFromDir` → per-character store→import with `failures[]` isolation →
  `reconcileStats` — ONE composition-layer driver; the HTTP zip route and the `import-st` job
  runner stay thin adapters (parse request / report progress).
- Bind `env.import.importAll` (today `notBuilt(…)` at `entry/compose/runner-env.ts`) to it — the
  `import-st` runner's dry-run/changed/settle shape is already built around that seam.

### Re-import semantics (carried resolutions — dictate the wave, do not re-litigate)

- **Edit-in-place under D28.** Re-import with new content edits the flat `characters` row in place
  (no version to fork; the old COW carry-forward is dead). `character.snapshot` is the only history
  path and is NOT auto-triggered by re-import.
- **Content-hash idempotency completes the oracle.** `cardContentHash` (`#kit/serde/card`, PD-33 —
  semantic fields ONLY, deliberately excluding `creator`/`creatorNotes`/`cardVersion`/`extensions`)
  + `(ownerId, handle)` matching so a re-encoded or edited card MATCHES its existing character
  instead of colliding; `importHash` (file bytes) rides along as provenance + the byte-identical
  fast path (built). **PD-108 is the built-slice hole this closes** — see the registry row.

## PD-78 — post-import backfill + reconcile wiring

- `enqueueBackfill` op on `ImportContext` → **ONE `memory-backfill` workload per import run**
  (owner-scoped, over the freshly imported `real_conversation`-bucketed chats), not per-character —
  matches the post-import `reconcileStats` shape, avoids N job rows. The workload kind + runner are
  BUILT (`@orb/contracts/workloads`, `runners/memory-backfill.ts`); nothing enqueues from import
  today.
- The backfill generates digests/segments and calls `embeddings.store` itself — memory does NOT go
  through the event indexer.
- `reconcileStats` stays an inline post-import call (economics is not event-driven); the
  `import-st` runner half is built — the driver wave wires it for the HTTP path too.
- **No `import.completed` event — reuse `character.updated`** (the embeddings indexer already
  subscribes). A bulk import firing N events is coalesced/debounced at the `entry/` bus if it ever
  hurts — bus tuning, not a new event type (the bus is built without debounce today).
- **Gate candidate (carried invariant):** no import path creates canonical content without the
  downstream index running — a contract test asserts importing chats enqueues a backfill for
  `real_conversation` chats (the card half is already enforced: `character.create` emits, test-pinned).
