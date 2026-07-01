# Orbweaver — `import`: ST-profile → canon, as a canon-write that emits events

> **Status: planning (authoritative detail).** The import domain maps parsed SillyTavern structures
> (character cards, chat-JSONL, `settings.json` personas) onto the canonical schema. Two defining
> changes from neo-tavern: **(1) import emits events** — today it stops at row INSERT and emits
> NOTHING (verified: zero `emit`/`bus`/`publish` in `domain/import` or `http/import.ts`), so imported
> content never auto-indexes; in orbweaver import is a **canon-write** that emits `character.updated`
> (+ enqueues a memory backfill) so the embeddings indexer runs over the freshly imported corpus.
> **(2) import + export share ONE serde core** — the tolerant `RawCard`→canonical reader, the strict
> V3 emitter, the WI-entry mapper, and the PNG codec live once (`@orb/server/kit/serde/*` +
> `@orb/contracts/character` + `@orb/kit/png-card-chunk`) and are consumed by both directions.
> Authoritative upstream: `AGENTS.md` §4 (import pain ledger) + §7.3 (serialization/serde core,
> LOCKED) + §7.4/§7.5 (types + dispatch); `core/Core-Core-Legacy-Migration-and-Gaps.md` §1–§5 (the serde homes, the
> authoritative inventory); `domains.md` + `embeddings.md` §"events" (the indexer subscribers);
> `character.md` §7.3 + the D28 one-row card model; `tag.md` (`proposedTags` → junction status);
> `Core-0-Architecture-and-Structure.md` §4 (the 8-slot template).

---

## What this domain owns

- **The ST-format PARSERS** — pure, stateless readers: `parseCardPng`/`parseCardJson` (PNG `tEXt`
  chunk + bare JSON → canonical card), `parseChatJsonl` + `parseStDate` (the date-format zoo →
  epoch-ms UTC), `parseStPersonas` (`settings.json` → personas). Bytes/text in → a typed parsed
  structure out; no DB, no logger control-flow.
- **The profile collector** — `collectBundlesFromDir`: walks a staged ST profile dir, pairs cards to
  chat dirs by `slugifyHandle`, disambiguates slug collisions, runs the second-chance fuzzy pairing
  (trailing-digit + `main_<Name>_spec_vN` decorations), and classifies what was dropped
  (orphans / unreadable / skipped / collided / fuzzy-paired) into an auditable `CollectResult`.
- **The canon write path** — `importCharacter` / `importChats` / `importPersonas`: maps the parsed
  structures onto a flat `characters` row (D28; identity + all card content in one row) →
  `world_books`/`world_entries`/`character_books` keyed on `characters.id`;
  `chats` → `messages` → `message_variants` + branch resolution; `personas`. Each character and each
  chat commits as ONE atomic libSQL `db.batch` (the resumable all-or-nothing invariant).
- **Idempotency** — character matched by `(ownerId, handle)` + a CONTENT hash (`cardContentHash` over
  semantic fields, NOT PNG bytes); chat matched by `importHash` (file bytes). Re-running an import is
  safe + resumable.
- **Cross-verb attribution state** — the `personaByUserName` map: `importPersonas` populates it, the
  chat writer reads it to attribute each imported chat's `user_name` to the persona the user RP'd as.
- **The event emission + backfill enqueue** (NEW) — after a character is created or edited in place
  (the flat `characters` row), import emits `character.updated` and enqueues a memory backfill for the `real_conversation`-bucketed
  imported chats.

This domain does **not** own: the **serde core** — the card mapper (`cardFromJson`/`buildCardV3`) lives
in `@orb/server/kit/serde/card`, the WI-entry mapper (`loreEntryColumns`/`loreEntryMetadata`/
`exportBookEntry`) in `@orb/server/kit/serde/world-entry`, the canonical `CharacterCard` shape +
`characterCardV3Schema` in `@orb/contracts/character`, the PNG `tEXt` codec in `@orb/kit/png-card-chunk`,
and the ST injection-role bimap in `@orb/kit/world-info` — all SHARED with `export`. It does not own
the byte storage of card/avatar PNGs (that is `assets` — the bulk driver injects `assets.store`); the
asset-store-then-import orchestration (that is a composition-layer driver, not the domain); the event
bus (an `entry/` concern; import emits via an injected op); the embeddings write (that is `embeddings`,
reached only through the event/indexer path); persona/character business logic beyond the import mapping.

---

## The two locked shifts

### (1) Import is a canon-write that emits events (was: a silent INSERT)

> **Today import writes rows and emits nothing — imported content is invisible to every downstream
> indexer until a manual reconcile.** In orbweaver every import that creates or edits canonical content
> emits the same domain event a first-class CRUD write would.

| neo-tavern (verified)                                                               | orbweaver                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `importCharacter` ends at `db.batch` + a `log.info`                                 | emits `character.updated` per created/edited character (via injected `emit` op)                                                    |
| card text never reaches `character_embeddings` until a separate run                 | `embeddings/indexer:onCharacterUpdated` fires → `embeddings.store(kind='card', lens='card-text', …)`                               |
| imported `real_conversation` chats never embed digests                              | import **enqueues a memory backfill workload** for the imported chats (the `bucket` field is the gate)                             |
| `import-st` calls `reconcileStats` inline at the end (the lone post-import refresh) | stats reconcile stays (economics is not event-driven); the _content_ indexes now run via the event path, not a bespoke inline call |

The event bus SHAPE is an `entry/` decision (in-process `EventEmitter` vs a typed bus — see
`embeddings.md` §open); the payload shapes live in `@orb/contracts/events`. Import receives an `emit`
op + an `enqueueBackfill` op on its context, wired at the composition root — it never reaches into
`embeddings` or `workloads` sideways.

### (2) Import + export share ONE serde core (was: two drifting mappers)

> **The card↔wire mapping, the WI-entry mapping, the PNG codec, and the ST role bimap each live in
> exactly one module, consumed by both directions.** `import` is the IN consumer (tolerant), `export`
> is the OUT consumer (strict); a round-trip (import → export → reimport) is pinned by tests.

| Shared unit                                                           | One home                            | import uses                            | export uses                |
| --------------------------------------------------------------------- | ----------------------------------- | -------------------------------------- | -------------------------- |
| `cardFromJson` (tolerant IN adapter)                                  | `@orb/server/kit/serde/card`        | `parseCardPng`/`parseCardJson` wrap it | —                          |
| `buildCardV3` (strict OUT emitter)                                    | `@orb/server/kit/serde/card`        | —                                      | `exportCharacter` calls it |
| `loreEntryColumns`/`loreEntryMetadata` (IN) · `exportBookEntry` (OUT) | `@orb/server/kit/serde/world-entry` | character writer                       | export verb                |
| `CharacterCard` + `characterCardV3Schema` + `CHARA_CARD_V3_SPEC`      | `@orb/contracts/character`          | parser return type                     | emit/validate              |
| `readCardChunk`/`writeCardChunk`/`isPng` (string-based)               | `@orb/kit/png-card-chunk`           | `readCardChunk` (read)                 | `writeCardChunk` (write)   |
| ST injection-role bimap `injectionRoleFromSt`/`injectionRoleToSt`     | `@orb/kit/world-info`               | serde + persona parser                 | serde                      |

---

## The 8-slot layout

```
domain/import/
├── index.ts                 FRONT DOOR — the only legal external import
├── service.ts               COMPOSITION ROOT — wires the three verbs + injected deps. ZERO logic.
├── context.ts               DI BUNDLE — explicit ImportContext interface (not ReturnType<>):
│                              { db, ownerId, personaByUserName, emit, enqueueBackfill }
├── contract/
│   ├── service.ts           ImportService interface + ImportServiceDeps + injected-op types
│   │                          (EmitDomainEvent, EnqueueMemoryBackfill, StoreAsset)
│   ├── params.ts            ImportCardInput · ImportChatInput · ImportPersonaInput · Import{Character,Chats}Input
│   ├── results.ts           Import{Personas,Character,Chats}Result
│   ├── views.ts             the PARSER return contracts: ParsedChat / ParsedChatMessage / ParsedVariant
│   │                          / ParsedPersona / ParsedPersonas / ChatBucket / CollectResult
│   └── errors.ts            re-exports DomainNotFoundError from @orb/kit/errors
├── verbs/
│   ├── import-character.ts   one card + its chats → canon; emits character.updated; enqueues backfill
│   ├── import-chats.ts       loose JSONL into an existing character (explicit target)
│   └── import-personas.ts    settings.json personas (populates personaByUserName)
├── persistence/
│   ├── character-writer.ts   the flat `characters`-row write-set builder (D28 — see below)
│   └── chat-writer.ts        importChatsIntoCharacter: chats→messages→variants + branch resolution
├── substrate/                PURE parsers (zero I/O) + the dedup hash
│   ├── card.ts              parseCardPng/parseCardJson (compose kit codec + server/kit serde) + cardContentHash
│   ├── chat.ts             parseChatJsonl + parseStDate + the bucket classifier
│   └── persona.ts          parseStPersonas + the ST position/role normalization
└── loader/                  NAMED SUBSYSTEM — profile-dir collection
    ├── collect.ts          collectBundlesFromDir — the pure pairing/collision/fuzzy logic
    └── fs-port.ts          the injected readdir/readFile/stat port (fs impl wired at entry/infra)
```

**`substrate/` vs `persistence/`:** the three parsers are pure (`str`/`nullIfEmpty` fold into
`@orb/kit/strings`); they hold NO DB and no fs. `persistence/` is the two writers — the ONLY db writers
in the domain. They write `@orb/db` schema **directly** (sanctioned bulk-serializer access — see the
movement table), not through sibling front doors.

**`loader/` is the one I/O-bearing subsystem, and its I/O is injected.** The pairing semantics
(slug-collision disambiguation, the fuzzy second-chance pairing, the skip-list) are import business
logic and stay PURE; the `readdir`/`readFile`/`stat` calls become an injected `fs-port` so the pairing
logic is testable without a filesystem and the actual node:fs lives at the composition tier. (Same
discipline as "`domain/import` can't reach `domain/assets`" — inject the boundary.)

**The bulk driver is NOT in the domain.** `importCollectedProfile` (personas-first → per-character
store-then-import → `failures[]` isolation) orchestrates `domain/import` + `domain/assets` (the injected
`store`) — a cross-feature composition. It lives at `entry/import/run-profile-import.ts`, shared by the
HTTP zip route and the `import-st` job runner (see §"bulk-loop unification" below).

---

## Verbs (the `ImportService` interface)

```typescript
ImportService = {
  // settings.json → personas; MUST run before the chat importers (populates personaByUserName).
  importPersonas(input: { personas: ImportPersonaInput[] }): Promise<ImportPersonasResult>

  // one ST card + its chats → canon (the flat `characters` row → embedded lorebook → chats → messages →
  // variants → branch resolution). Idempotent by (ownerId, handle) + contentHash. EMITS character.updated;
  // ENQUEUES a memory backfill for the real_conversation chats.
  importCharacter(input: ImportCharacterInput): Promise<ImportCharacterResult>

  // loose JSONL into an existing character (its flat `characters` row; the standalone path; explicit target).
  importChats(input: ImportChatsInput): Promise<ImportChatsResult>
}

// Collapsed from { ownerId } | { ownerHandle } to just the resolved principal id (§7.1: identity is
// resolved ONCE at the edge; the ensureUser-on-handle branch lifts to entry/).
type ImportServiceDeps = { readonly ownerId: UserId }
```

**The `ownerHandle` arm is gone.** Today `ImportServiceDeps` is `{ ownerId } | { ownerHandle }` and the
context calls `ensureUser(db, ownerHandle)` on the handle arm. Under §7.1, identity is resolved once at
the edge and an immutable `Principal` flows down; `ensureUser` (→ `domain/sessions`) is a
composition-root concern. The CLI/HTTP entry resolves the owner and passes `ownerId`; the domain never
re-resolves.

---

## Public surface (`index.ts`)

```typescript
// Service + factory
export { createImportService } from "./service";
export type { ImportService, ImportServiceDeps } from "./contract/service";

// Input types (consumed by the bulk driver at entry/ + integration tests)
export type {
  ImportCardInput,
  ImportChatInput,
  ImportPersonaInput,
  ImportCharacterInput,
  ImportChatsInput,
} from "./contract/params";
export type {
  ImportCharacterResult,
  ImportChatsResult,
  ImportPersonasResult,
} from "./contract/results";

// Parsers (pure — driven by the entry bulk driver + tests)
export { parseCardPng, parseCardJson, cardContentHash } from "./substrate/card";
export { parseChatJsonl, parseStDate } from "./substrate/chat";
export { parseStPersonas } from "./substrate/persona";
export type {
  ParsedChat,
  ParsedChatMessage,
  ParsedVariant,
  ChatBucket,
  ParsedPersona,
  ParsedPersonas,
} from "./contract/views";

// Profile collector (the loader subsystem; fs-port injected by the caller)
export { collectBundlesFromDir } from "./loader";
export type { CollectResult } from "./contract/views";
```

**`slugifyHandle` is no longer re-exported here** — it moves to `@orb/kit/slug`; the loader + the bulk
driver import it from kit directly. The parsed-card SHAPE is the canonical `CharacterCard` from
`@orb/contracts/character` (the parsers RETURN it). `MessageRole` (today an inline union re-exported
from this front door) moves to `@orb/contracts` (the canonical `messageRole`) — see §7.5.

---

## Movement table

Every unit: where it goes, why, and what enforcement tier makes a violation RED.

| Unit                                                                                                              | Outcome                                 | Target                                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Enforcement tier                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared/serde/card-serde.ts` — `cardFromJson` (tolerant IN), `buildCardV3` (strict OUT) + internals              | → `server/kit`                          | `@orb/server/kit/serde/card`                                                       | The ONE serde core shared by import+export. Server-only pure (no client consumer), so `server/kit` not `kit`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | resolve-time: `_shared` gone; `@orb/server/kit` is a declared seam below domains                                                       |
| `_shared/serde/world-entry-serde.ts` — `loreEntryColumns`, `loreEntryMetadata`, `exportBookEntry`                 | → `server/kit`                          | `@orb/server/kit/serde/world-entry`                                                | Same serde core; the WI-entry mapper, both directions adjacent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | resolve-time                                                                                                                           |
| `_shared/png-card-codec.ts` — `isPng`, `readCardChunk`, `writeCardChunk` (+ crc32/makeChunk/PNG_SIGNATURE)        | → `kit`                                 | `@orb/kit/png-card-chunk`                                                          | String-based (never imports the card type) → isomorphic-pure → `kit`. Dual-chunk (chara V2 + ccv3 V3) load-bearing. Drops the steady `node:buffer` import (base64/latin1 over `Uint8Array`).                                                                                                                                                                                                                                                                                                                                                                                                                    | lint-time: `kit-purity` gate (NO `node:*` import — `node:buffer` included; no domain import)                                           |
| canonical `CharacterCard` + `characterCardV3Schema` + `CHARA_CARD_V3_SPEC`                                        | → `contracts`                           | `@orb/contracts/character`                                                         | The one canonical card shape (§7.3 LOCKED). Parser return type + emit validator; both server directions + client forms consume it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | resolve-time: `@orb/client` declares `@orb/contracts`, never `@orb/server`                                                             |
| `card.ts` — `parseCardPng`/`parseCardJson`/`cardContentHash`                                                      | stays domain feature                    | `domain/import/substrate/card.ts`                                                  | The import ENTRY: compose `kit/png-card-chunk` (decode) + `server/kit/serde/card` (`cardFromJson`) + the content-hash dedup key. The dedup key is import-specific.                                                                                                                                                                                                                                                                                                                                                                                                                                              | resolve-time (same server package)                                                                                                     |
| `chat.ts` — `parseChatJsonl`, `parseStDate`, the bucket classifier                                                | stays domain feature                    | `domain/import/substrate/chat.ts`                                                  | Pure ST-format reader; no shared consumer (export emits canon, doesn't re-read JSONL).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | resolve-time                                                                                                                           |
| `chat.ts` — `export type MessageRole = "user"\|"assistant"\|"system"`                                             | → `contracts`                           | `@orb/contracts` (the canonical `messageRole`)                                     | §7.5: the most-respelled axis (132 touches). One importable union; the parser imports it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | compile-time: inline re-spelling diverges → `tsc`; lint: `no-inline-union-redecl`                                                      |
| `chat.ts` — `ParsedChat`/`ParsedChatMessage`/`ParsedVariant`/`ChatBucket` (inline exported interfaces)            | stays domain feature                    | `domain/import/contract/views.ts`                                                  | The parser RETURN contract; today inline in a substrate file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | lint-time: `no-inline-types`                                                                                                           |
| `persona.ts` — `parseStPersonas` + `stPositionToNeo`/`metadataFromDescriptor`                                     | stays domain feature                    | `domain/import/substrate/persona.ts`                                               | Pure ST→neo persona normalization; uses `@orb/kit/persona` (`PersonaDescriptionPosition`) + `@orb/kit/world-info` (the role bimap).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | resolve-time                                                                                                                           |
| `persona.ts` — `ParsedPersona`/`ParsedPersonas` (inline exported)                                                 | stays domain feature                    | `domain/import/contract/views.ts`                                                  | Parser return contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | lint-time: `no-inline-types`                                                                                                           |
| `loader.ts` — `collectBundlesFromDir` pairing/collision/fuzzy logic                                               | stays domain feature                    | `domain/import/loader/collect.ts`                                                  | Import business logic (the slug-pairing semantics).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | resolve-time                                                                                                                           |
| `loader.ts` — `readdir`/`readFile`/`stat` (node:fs)                                                               | split: inject the I/O                   | `domain/import/loader/fs-port.ts` (port type); fs impl at `entry/`/`infra/storage` | `substrate`/domain must be testable without a filesystem; the node:fs lives at the composition tier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | lint-time: `substrate-no-io` / `domain-no-node-fs` (gate candidate)                                                                    |
| `import-profile.ts` — `importCollectedProfile` (store-then-import bulk glue)                                      | → composition layer                     | `entry/import/run-profile-import.ts`                                               | Orchestrates `domain/import` + `domain/assets` (injected `store`) — a cross-feature composition; can't live inside a domain. Shared by the HTTP route + the job runner.                                                                                                                                                                                                                                                                                                                                                                                                                                         | resolve-time: only `entry/` may import two domain front doors                                                                          |
| `persistence/chat-writer.ts` — `importChatsIntoVersion` (neo) → `importChatsIntoCharacter`                        | stays domain feature, **D28-flattened** | `domain/import/persistence/chat-writer.ts`                                         | The shared chats→messages→variants writer + branch resolution. Rewritten to key chats + branch resolution on `characters.id`, not `characterVersionId` (D28; no version exists).                                                                                                                                                                                                                                                                                                                                                                                                                                | compile-time: `chats.characterVersionId` column is gone → any reference fails `tsc`                                                    |
| `verbs/import-character.ts` — the COW version-bump + `character_books` INSERT-FROM-SELECT carry-forward           | **deleted / replaced**                  | edit-in-place or `character.snapshot`                                              | This block is the SAME `forkVersion` INSERT-FROM-SELECT `character.md` deletes; in neo it existed only because the cv-pin welded chats to an old version. D28 removes versions entirely, so there is nothing to fork (edit-in-place is always safe).                                                                                                                                                                                                                                                                                                                                                            | compile-time: `forkVersion` is gone; there is no version row to bump (D28)                                                             |
| `verbs/import-character.ts` — `card.tags` → `character_versions.proposedTags` (JSON)                              | **reshape (BUILT 2026-06-28)**          | `character_tags` rows `source:'card', status:'pending'`                            | `tag.md` §"DECIDED + the write side BUILT": proposed = a junction STATUS, not a parallel JSON store. DECIDED path: import carries `card.tags` (trim + case-insensitive dedupe) via the **injected `tag.attachCardTagByName({source:'card',status:'pending'})` op** (wired at compose — NOT a direct `@orb/db` write; the tag domain owns the source/status + the race-safe resolve-or-create). This is ST's `importTags` minus the 4-way `tag_import_setting`/ASK dialog — every card tag lands as a `pending` suggestion the user Accepts later (the distill pass joins the SAME junction as `source:'auto'`). | compile-time: `proposedTags` column absent from schema → read site is `tsc` red                                                        |
| `verbs/import-character.ts` — the typed columns `creator`/`cardVersion`/`regexScripts`/`extensions`/`depthPrompt` | **keep (already correct)**              | flat `characters` typed columns (D28)                                              | Steady ALREADY promotes these (the `raw`-blob lossiness is fixed); D28 lands them on the flat `characters` row. Carry forward.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | compile-time: schema columns are the type source                                                                                       |
| `context.ts` — `ReturnType<typeof createImportContext>`                                                           | stays domain feature                    | explicit `export interface ImportContext`                                          | Inferred type is invisible; add `emit`/`enqueueBackfill` ops to the bundle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | lint-time: `no-inline-types`                                                                                                           |
| `context.ts` — `ensureUser(db, ownerHandle)` (owner resolution)                                                   | → `domain/sessions` (via entry)         | `entry/` resolves owner; domain takes `ownerId`                                    | §7.1: identity resolved once at the edge; `ensureUser` is a sessions verb.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | resolve-time: `entry/` is the only tier importing both                                                                                 |
| `_shared/ids.ts` — `newTypeId`                                                                                    | → `@orb/kit`                            | `@orb/kit/ids`                                                                     | Pure TypeID mint; the canonical kit case. Import keeps minting strict prefixed IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | resolve-time                                                                                                                           |
| `_shared/errors.ts` — `DomainNotFoundError`                                                                       | → `@orb/kit`                            | `@orb/kit/errors`                                                                  | Pure error base; `import-chats` throws it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | resolve-time                                                                                                                           |
| `_shared/batch.ts` — `batchStmt`/`batchMany`                                                                      | → `@orb/db/kit`                         | `@orb/db/kit`                                                                      | DB primitive (needs drizzle `BatchItem` types). The ~per-chat inline `BatchItem<"sqlite">` casts wire to it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | resolve-time                                                                                                                           |
| `_shared/roster-rows.ts` — `buildInitialRosterRows`                                                               | → `domain/chat` (chat-private)          | `domain/chat/persistence/roster`                                                   | Roster is chat's concern. Import (a bulk db writer) builds the same `chat_participants` row shape against `@orb/db` directly — it does NOT import chat's front door.                                                                                                                                                                                                                                                                                                                                                                                                                                            | resolve-time: `domain-no-cross-feature`; the shape agreement is a contract                                                             |
| `http/import.ts` — inline `isPng` (3rd copy)                                                                      | → `@orb/kit`                            | `@orb/kit/png-card-chunk`                                                          | Dedupe with the codec's `isPng`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | resolve-time                                                                                                                           |
| `env.IMPORT_DEFAULT_SOURCE` (read in chat-writer)                                                                 | **DROPPED (PD-15)**                     | —                                                                                  | **PD-15 (2026-06-28): neo-jank.** No chat-level default source — each imported ST message maps its per-message provenance → its `message_variant` (D26); the env comment was pulled from `foundation/env`. No AppSettings toggle.                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                      |
| direct `@orb/db` reads/writes in the two writers                                                                  | **sanctioned, stays**                   | `@orb/db` schema                                                                   | Import is a bulk serializer (like export, `world-info/pool.ts`, `character/list` tag joins) — it reads/writes schema directly, not through sibling front doors. Enqueue still goes through workloads; events through the injected bus op.                                                                                                                                                                                                                                                                                                                                                                       | lint-time: dep-cruiser exempts import/export persistence from the front-door rule but still forbids reaching another domain's `verbs/` |

---

## Cross-feature composition (the injection model)

Import is driven BY the bulk driver (`entry/import/run-profile-import.ts`) + the HTTP card/chat routes

- the `import-st` job runner. It composes other domains only through injected ops + direct `@orb/db`.

**Injected into the import context at the composition root:**

| Op injected                  | Provided by  | Used for                                                             |
| ---------------------------- | ------------ | -------------------------------------------------------------------- |
| `emit` (domain-event bus op) | `entry/` bus | emit `character.updated` after a character create/edit               |
| `enqueueBackfill`            | `workloads`  | enqueue a memory backfill for the imported `real_conversation` chats |

**Injected into the bulk driver (entry/), not the domain:**

| Op injected                            | Provided by                       | Used for                                                                   |
| -------------------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `store(bytes, kind)`                   | `assets` domain                   | CAS-store the card/avatar PNG → `avatarAssetId` (one blob, both roles)     |
| `ownerId`                              | `sessions`/auth seam              | the resolved principal id (replaces the `ownerHandle`+`ensureUser` branch) |
| `collectBundlesFromDir` + an `fs-port` | `domain/import` + `infra/storage` | walk the staged profile dir                                                |
| `reconcileStats`                       | `stats` domain                    | post-import economics rollup (unchanged; economics is not event-driven)    |

**Consumed downstream via the event/indexer path (import never calls these directly):**

- `character.updated` → `embeddings/indexer:onCharacterUpdated` → `embeddings.store(kind='card',
lens='card-text', key=characterId, …)`. Card text auto-indexes on import — the central fix.
- the card PNG store emits `asset.created` (from the `assets` domain) → `embeddings/indexer:onAssetCreated`
  → image embeddings. Import doesn't emit this; `assets.store` does.
- the enqueued memory backfill → `memory` generates digests/segments for the imported chats and calls
  `embeddings.store` itself (memory does NOT go through the indexer — `embeddings.md` §events).

---

## Spine thread intersections

### §7.3 serialization / serde core

Import is the IN consumer of the LOCKED one-card model. The tolerant `RawCard`→`CharacterCard`
normalization (`cardFromJson`) stays — but only as the tolerant input adapter that normalizes INTO the
canonical `@orb/contracts/character` shape, never as a parallel lossy shape. `creator` / `cardVersion` /
`regexScripts` / `extensions` / `depthPrompt` are **typed columns** (steady already promoted them — the
`raw` blob is reserved for genuinely-unknown vendor extras via `residualExtensions`). The round-trip
(import → export → reimport) is pinned by tests: what `buildCardV3` emits re-parses cleanly through
`cardFromJson`. The PNG codec is `@orb/kit/png-card-chunk` (string-based, dual-chunk).

### §7.4 types and schemas — one home, one direction

- `CharacterCard` / `characterCardV3Schema` → `@orb/contracts/character` (cross-boundary).
- `MessageRole` → `@orb/contracts` (canonical `messageRole`).
- `ParsedChat` / `ParsedChatMessage` / `ParsedVariant` / `ChatBucket` / `ParsedPersona` /
  `ParsedPersonas` / `CollectResult` → `domain/import/contract/views.ts` (the parser return contracts;
  domain-internal, re-exported from the front door for the bulk driver + tests).
- `ImportCardInput` / `ImportChatInput` / `ImportPersonaInput` / `Import{Character,Chats}Input` →
  `domain/import/contract/params.ts`.
- `Import{Personas,Character,Chats}Result` → `domain/import/contract/results.ts`.
- `ImportContext` → explicit `export interface`, not `ReturnType<>`.
- `ChatWriteCounts` (the writer's return tally) → `contract/results.ts` (today inline in `chat-writer.ts`).

### §7.5 string-union dispatch discipline

The "role-map triplication" the ledger names is **mostly already resolved**: the ST WI injection-role
bimap (`injectionRoleFromSt`/`injectionRoleToSt`) is single-homed in `#shared/world-info`
(→ `@orb/kit/world-info`) and imported by the card serde, the WI-entry serde, and the persona parser —
NOT re-spelled. What IS an inline leak in import is the chat **`MessageRole`** union (`chat.ts:19`) →
move to `@orb/contracts`. The persona parser's ST position constants (`ST_IN_PROMPT=0`…`ST_NONE=9`) are
a distinct axis (persona description placement) and map to `PersonaDescriptionPosition`
(`@orb/kit/persona`); that local normalization stays. `source` written on imported chats
(`env.IMPORT_DEFAULT_SOURCE`) is the `ChatSource` union — one importable canonical from
`@orb/contracts/connection`.

### §8.6 first-class principal blast radius

Import writes `chat_participants` rows (the founding roster) and stamps persona attribution. Under the
first-class-principal model, imported chats are still owner-authored (no agent principal at import time),
but the writer must build roster rows against the orbweaver `chat_participants` shape (the `kind`/`isAi`
split, `authorUserId`). Import constructs these directly against `@orb/db` (the `buildInitialRosterRows`
shape, owned by chat) — the row shape is a contract both sides honor.

### persona.md / tag.md intersections

- **persona.md** (drop `chats.personaId`): the chat writer stamps `chats.personaId` + `pinnedPersonaId`
  - per-message `personaId` today. Orbweaver drops `chats.personaId`; the anchor (neo `pinnedPersonaId` →
    renamed `chats.anchorPersonaId`) + per-message attribution stay; active-persona lives on `chat_participants`.
- **tag.md** (`proposedTags` → status): import writes `character_tags` rows with `status:'pending'`
  instead of the `character_versions.proposedTags` JSON column; export reads `accepted` rows, closing
  the round-trip gap.

---

## Esoteric / load-bearing (do not flatten)

1. **The tolerant `RawCard`→canonical normalization.** Detection ORDER (`spec`/`data` → `char_name`
   Pygmalion → `name` V1) matches the canonical reader; `selectBestCharacterBook` (most-NAMED-entries
   wins when a card embeds a book twice); `extractLorebook` (entries are dict-OR-list in the wild);
   `parseDepthPrompt` (depth defaults to ST's 4; role via the bimap). Without this, ~5–15% of a real
   corpus silently fails to import.
2. **Idempotency hashing — content, not bytes.** `cardContentHash` is a stable-stringify sha256 over
   the SEMANTIC fields ONLY — it deliberately excludes `creator`/`creatorNotes`/`cardVersion`/
   `extensions` so a re-encoded identical card (new PNG bytes, new `importHash`) does NOT spuriously
   version. `importHash` (file bytes) rides along as provenance. `chats.importHash` (file bytes) is the
   per-chat dedup oracle, pre-fetched in ONE query AND updated mid-loop (two byte-identical files in
   one run both skip).
3. **The `constant → scopeMode:"always"` WI round-trip.** `loreEntryMetadata` derives `scopeMode:
"always"` from ST's `constant: true` (the runtime reads `scopeMode`, not `constant` — a keyed
   constant entry would otherwise silently demote to keyword scope); `extensions.{position:4,depth,role}`
   → `metadata.inject`. `exportBookEntry` is the exact inverse. Byte-identical round-trip is test-pinned.
4. **`parseStDate` — the filename date wins.** ST re-save/migration rewrites header + every message
   date to the migration time; the chat's TRUE creation date survives ONLY in the filename token. Parse
   the filename FIRST, then header `create_date`, then null. Without it every migrated chat collapses
   onto its migration date.
5. **`updatedAt` = `Math.max(send_dates)`, not import `now`.** Stamping every imported chat with `now`
   piled the whole corpus at the top of the recent-chats feed; the real last-message time spreads them
   back across their timeline (`Math.max`, not last-in-order — ST send_dates are non-monotonic).
6. **`buildVariants` drops empty swipe slots + remaps the active index.** Real corpora leave empty
   strings IN the swipe pool (gaps from aborted generations); persisting them writes empty
   `message_variants` rows. Drop, re-index 0..k, remap `swipe_id` onto the survivors; `mes` (rendered
   content) is authoritative regardless.
7. **The skip-list + collision + fuzzy-pairing trilogy in the loader** — deterministic (filename-sorted)
   collision disambiguation, the curation skip-list (drops a card AND its chats), and the second-chance
   fuzzy pairing (trailing-digit + `main_<Name>_spec_vN`), each recorded in `CollectResult` (never
   silent) so a wrong guess is operator-auditable.
8. **`proposedTags` is WIRED, not dead** — its problem is SHAPE (a parallel JSON store), not deadness;
   the fix is the junction-status reshape, not a delete.
9. **The bulk-loop unification is PARTIALLY DONE in steady** — see the conflicts note below.

---

## Invariants (gate candidates)

1. **Import emits `character.updated` for every created/edited character** — no import path writes a
   `characters` row without emitting (so the embeddings indexer always runs).
   _Enforcement: test-time — a contract test asserts importing a card emits `character.updated` and
   enqueues a backfill for `real_conversation` chats._

2. **The serde core is single-homed** — `cardFromJson`/`buildCardV3` exist ONLY in
   `@orb/server/kit/serde/card`; the WI-entry mapper ONLY in `@orb/server/kit/serde/world-entry`; the
   PNG codec ONLY in `@orb/kit/png-card-chunk`. No second card↔wire mapper.
   _Enforcement: resolve-time (the modules are the only export sites) + a `serde-core` lint that fails
   on a duplicate mapper declaration; round-trip test pins import↔export agreement._

3. **The canonical card is the ONE shape** — `cardFromJson` normalizes INTO `@orb/contracts/character`;
   `creator`/`cardVersion`/`regexScripts`/`extensions`/`depthPrompt` are typed columns; `raw`/residual
   `extensions` holds only genuinely-unknown vendor keys.
   _Enforcement: compile-time — promoting a known field into the residual blob is a `tsc` error (the
   typed column is the only home); round-trip test._

4. **Chats never reference a character version (D28: none exists)** — the chat writer + branch
   resolution key on `characters.id`; `chats.characterVersionId` does not exist.
   _Enforcement: compile-time — the column is absent from `@orb/db/schema/chat`._

5. **No COW version carry-forward** — import does not mint a new version row via an
   INSERT-FROM-SELECT book carry-forward (the deleted `forkVersion` path; D28 has no version to mint).
   Re-import with new content edits the flat `characters` row in place (always safe — no cv pin ever
   existed); an explicit `character.snapshot` is the only history path, and re-import never triggers it.
   _Enforcement: compile-time — `forkVersion` is deleted; there is no version row or cv-pin column (D28)._

6. **Proposed tags are junction rows, not a JSON column** — import writes `character_tags`
   `status:'pending'`; no write to `character_versions.proposedTags`.
   _Enforcement: compile-time — the `proposedTags` column is absent from the schema → any write is `tsc` red._

7. **The parsers are pure; the loader's I/O is injected** — no `node:fs` in `substrate/`; the loader's
   reads come through the injected `fs-port`.
   _Enforcement: lint-time — `substrate-no-io` + a `domain-no-node-fs` dep-cruiser rule._

8. **Each character + each chat commits as ONE atomic `db.batch`** — `db.transaction()` is banned
   (`:memory:` trap); a mid-import crash leaves a character/chat fully written or not at all.
   _Enforcement: lint-time (`no-db-transaction`) + test-time (a kill-mid-import test asserts no
   half-written character)._

9. **Identity is resolved once at the edge** — the domain takes `ownerId`; no `ensureUser`/handle
   round-trip inside import.
   _Enforcement: resolve-time — `domain/import` does not import `domain/sessions`; `entry/` resolves the owner._

---

## Resolved decisions (was: open)

- **`character.updated` vs a dedicated `import.completed` event — RESOLVED: reuse `character.updated`.** The
  embeddings indexer already subscribes; a bulk import firing N events is coalesced/debounced at the
  `entry/` bus (the debounce window is `entry/` tuning, not a new event type). No `import.completed`. (Same
  resolution as `core/Spine-Config-and-Serialization.md` §5.)
- **Backfill granularity — RESOLVED: ONE memory-backfill workload per import run** (owner-scoped, scans the
  freshly imported `real_conversation` chats), not per-character. Matches the post-import `reconcileStats`
  shape and avoids N job rows.
- **Bulk-loop unification scope — RESOLVED (the CONFLICT was stale recon).** Steady ALREADY unified the
  INNER per-character `store→import→failures[]` loop into `importCollectedProfile`; both callers drive it.
  The OUTER driver (collect → store → import → reconcile/emit) collapses to ONE composition-layer driver at
  `entry/import/run-profile-import.ts`; the HTTP zip route + the `import-st` job runner become thin adapters
  (parse request / report progress).
- **`character.md` `raw`-column listing — RESOLVED (no conflict remains).** `character.md` §"What this
  domain owns" + §7.3 now list the typed columns (`creator`/`cardVersion`/`regexScripts`/`extensions`) and
  state the `raw` blob is dropped — matching the steady schema (verified `db/schema/character.ts:137-140`).
  Residual unknown vendor keys live in `extensions`, not a lossy `raw`.
- **Re-import semantics under D28 — RESOLVED: edit-in-place.** The old "new content → COW version
  carrying books forward" model existed only to protect chats welded to a pinned cv. D28 removes versions
  entirely, so re-import with new content **edits the flat `characters` row in place** (always safe — no
  cv pin ever existed); the `forkVersion` INSERT-FROM-SELECT + the `character_books` carry-forward are
  deleted. An explicit `character.snapshot` (user-driven named save → a `character_snapshots` row) remains
  the explicit-history path but is NOT triggered automatically by re-import. Aligned with `character.md`
  (the History verbs + Invariant 4).
- **`loader` placement — RESOLVED: keep the pairing logic in the domain** (`loader/` subsystem) and inject
  only the `fs-port`. The slug-pairing/collision/fuzzy semantics are import business logic; `node:fs` lives
  at the composition tier behind the injected port.

### Still open (deferred, with criterion)

- **`IMPORT_DEFAULT_SOURCE` — DROPPED (PD-15, 2026-06-28; supersedes the prior DEFERRED + the D40 env-floor
  note that follows).** There is **no chat-level default source** and no AppSettings/env toggle — it was
  neo-jank. Each imported ST message maps its **per-message provenance → its `message_variant`** (D26); the
  env comment was pulled from `foundation/env`. The criterion + env-floor discussion below is **VOID** —
  retained only as historical context.
  _Env-floor status (D40):_ the floor itself is ALSO deferred to this (import) slice — it does NOT yet live in
  `foundation/env`. It is a `z.enum(CRED_SOURCES)` env floor with a NODE_ENV-conditional default
  (`max-pro-sub` dev/test, `openrouter` prod) that needs a post-parse transform (unlike env's two simple
  import toggles `IMPORT_SKIP_CHARACTERS`/`CORPUS_AUTOINDEX`), so it lands in `foundation/env` — co-located
  with its consumer — when `domain/import` is built, rather than guessed early into the boot floor.
  `foundation/env` carries a spec'd placeholder comment at the import-toggles block in the meantime; this is
  EXPLICIT deferral, not a silent drop. (The "delete the env read" criterion above thus first presumes the
  floor lands here.)
