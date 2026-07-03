# Orbweaver — `export`: the OUT half of the shared serde core

> **Status: planning (target spec).** Ground-truth: whole-file recon of neo-tavern's
> `src/server/domain/export/` (9 files, ~804 lines) plus the cross-domain serialization
> core it now shares with import (`_shared/serde/card-serde.ts`,
> `_shared/serde/world-entry-serde.ts`, `_shared/png-card-codec.ts`). The defining change
> from neo-tavern: **export stops being an independent mapper** — it becomes the OUT half
> of ONE serialization core that import shares, and it closes two lossiness gaps
> (`raw`-blob-only provenance; the `proposedTags` accepted-tags round-trip). This doc is the
> target spec. Authoritative upstream: `domains.md` (`export` row + Open decisions
> "serialization core" / "proposedTags round-trip"), `AGENTS.md` §4 (import/export
> pain), **§7.3 serde core**, §7.4 (types), `core/Core-Legacy-Migration-and-Gaps.md` §1–§3 (the serde
> symbols' homes, CITE-authoritative), `character.md` §7.3 (the one canonical card),
> `domain/tag` (the proposed→status redesign). `Core-0-Architecture-and-Structure.md` §4 is the 8-slot template.

---

## What this domain owns

Export reads an owned character / chat from canon and **serializes it to a downloadable
artifact** — the inverse of `domain/import`. Owner-scoped; returns bytes/text + a filename;
the entry layer streams them with a download header. Two verbs:

- **`exportCharacter`** — read the live character row + attached books + accepted tags → emit a
  **V3 character-card PNG** (the card JSON embedded as `tEXt` chunks in the avatar, or a
  256×256 placeholder when there's no avatar). Returns `{ bytes, filename }` or `null`.
- **`exportChat`** — read the chat + messages + variants + the persona/character names →
  emit **ST-compatible JSONL interchange** (round-trips through import) or a human-readable
  **TXT transcript**. Returns `{ text, filename }` or `null`. **Gated `requireHost` (D29)** — a chat
  is membership-scoped (D18, no `chats.ownerId`), and bulk transcript extraction is a host action in
  v1 (widening to `requireParticipant` is a deferred additive change).

Concretely, export owns **the OUT assembly and packaging only**:

- **The assembly** — orchestrating the row→serde-input projection: which columns to read,
  which books to walk, which tags to attach to the card, how to fold variants into swipes.
- **The db reads** — export reads `@orb/db` schema **directly** (sanctioned for a bulk
  serializer; the same pattern import uses — see `character.md` Movement). There is no
  `persistence/` indirection: each verb runs one big entity-specific read.
- **The artifact packaging** — `basePng` (avatar fetch + transcode + placeholder), the
  download-filename slug, the bytes/text envelope. The future **bulk/library zip export**
  (the symmetric counterpart to import's zip route) is this domain's packaging concern too
  (see Open decisions).
- **The chat interchange builders** — `buildChatJsonl` / `buildChatTxt` (pure, server-only,
  export-local): the ST-human date format, the swipe-array gate, the branch-graph + author's
  note round-trip.

This domain does **NOT** own (it COMPOSES these — they are the _shared_ serde core, not
export-local):

- **The card mapper** — `buildCardV3` (strict V3 OUT emitter) lives in
  `@orb/server/kit/serde/card`, **shared with import's `cardFromJson` (tolerant IN
  adapter)**. The export↔import round-trip is pinned by tests (`buildCardV3` output
  re-parses cleanly through `cardFromJson`).
- **The world-entry mapper** — `exportBookEntry` lives in
  `@orb/server/kit/serde/world-entry`, shared with import's `loreEntryColumns` /
  `loreEntryMetadata`.
- **The PNG byte codec** — `writeCardChunk` / `readCardChunk` / `isPng` live in
  `@orb/kit/png-card-chunk` (pure, **string-based so it never imports the card type**).
- **The canonical card shape** — `CharacterCard` / `characterCardV3Schema` /
  `CHARA_CARD_V3_SPEC` live in `@orb/contracts/character` (the one fully-modeled card; §7.3).
- **The ST role bimap** — `messageRoleFromSt` / `messageRoleToSt` live in
  `@orb/kit/message-role` (one copy; was written 4×).
- **The owner-scoped fetch** — `fetchOwned` lives in `@orb/db/kit`; the JSON boundary
  parser `parseRecord` stays in `@orb/db`.
- **The HTTP download routes** — `registerExportRoutes` is `entry/http`, not the domain (it
  calls the front door only).
- **The typed character columns** export reads (`creator`, `cardVersion`, `regexScripts`,
  `extensions`, `depthPrompt`, `proposedTags`→accepted `character_tags`) — those are
  `character` / `tag` domain schema; export is a read-only db consumer of them.

---

## Export is the OUT half of ONE serde core (the central design)

neo-tavern carries **two drifting mappers**. Export's card serde and import's card parser
are independent code coupled only by round-trip tests; the ST role-map is triplicated
(actually written 4×), the WI-entry mapping is hand-duplicated across import + export, and
the PNG chunk-walk is copied (read half in `import/card.ts`, write half in `export/png.ts`,
a 3rd inline `isPng` in `http/import.ts`). The steady clone already lifted these into
`_shared/serde` + `_shared/png-card-codec` — **the orbweaver target finishes the job** by
giving each a real layer-cake home and a gate:

| Concern         | neo-tavern (drifting)                                                                     | orbweaver (one core, gated)                                                               |
| --------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Card mapper     | `buildCardV3` (export) ≠ `cardFromJson` (import), test-coupled                            | ONE `@orb/server/kit/serde/card` — emit + read adjacent; round-trip test-pinned           |
| WI-entry mapper | hand-duplicated import vs export                                                          | ONE `@orb/server/kit/serde/world-entry`                                                   |
| PNG codec       | chunk-walk copied 2× + inline `isPng` 3rd                                                 | ONE `@orb/kit/png-card-chunk` (string-based, pure)                                        |
| ST role map     | written 4× (`persona.ts`, `lore.ts`, `card-v3.ts`, `card.ts`)                             | ONE bimap in `@orb/kit/message-role`                                                      |
| Canonical card  | 3 shapes; `creator`/`cardVersion`/`regex_scripts`/`extensions` survive **only via `raw`** | ONE fully-modeled card in `@orb/contracts/character`; those promoted to **typed columns** |

The defining fixes export delivers:

1. **Kill the drift.** Export imports the SAME `buildCardV3` / `exportBookEntry` import calls
   (through the shared core); a second emitter cannot exist because there is one exported
   symbol. Enforcement: resolve-time (the core is one module; both domains import it).
2. **Close the `raw`-blob lossiness.** `creator` / `character_version` / `regex_scripts` /
   `extensions` survive only through the `raw` blob today, so an **app-authored card** (one
   created in-app with no `raw`) silently drops them on export. Orbweaver promotes them to
   **typed columns** on the flat `characters` row (D28); the export verb reads each column
   straight off the row (the steady clone already does this — orbweaver makes the columns the schema
   source of truth, not the `raw` fallback). Enforcement: compile-time (typed columns exist;
   a `raw`-only read is the absence of a column).
3. **Close the `proposedTags` accepted-tags round-trip gap.** Export today reads
   `character_versions.proposedTags` and emits it as the card's `tags` — the **accepted**
   `character_tags` junction is never serialized, so accepted tags are silently lost on
   re-export. Per `domain/tag`, the `proposedTags` JSON column is deleted and `character_tags`
   grows a `status: 'pending' | 'accepted'` column; **export reads `character_tags WHERE
status='accepted'`** for the card's `tags`. Enforcement: compile-time (the `proposedTags`
   column is absent → any read site is a `tsc` error).

---

## The 8-slot layout

```
domain/export/
├── index.ts            FRONT DOOR — ExportService (type), ExportChatFormat (type),
│                         createExportService. (No error class — verbs return null.)
├── service.ts          COMPOSITION ROOT — createExportService(db, cas); spreads the two
│                         verb factories. ZERO logic.
├── context.ts          DI BUNDLE — explicit `export interface ExportContext { db; cas }`
│                         (NOT a `ReturnType<>` inference — the no-inline-types target)
├── contract/
│   ├── service.ts      ExportService interface (exportCharacter · exportChat) +
│   │                     ExportChatFormat = "jsonl" | "txt" (one canonical union, §7.5)
│   ├── params.ts       ExportChatMeta · ExportMessage · ExportVariant — the chat-builder
│   │                     input shapes (today inline in chat.ts; move to contract/)
│   ├── results.ts      ExportedCard { bytes; filename } · ExportedText { text; filename }
│   └── (no errors.ts)  — verbs return null when not-permitted / not-found; HTTP → 404
│                          (exportCharacter: not-owned; exportChat: not-host — D29)
├── verbs/
│   ├── export-character.ts  read character + books + accepted tags → buildCardV3 →
│   │                          writeCardChunk; basePng (avatar fetch + placeholder; the image
│   │                          transcode is the INJECTED infra/image imageTransform, D6 — not inline)
│   └── export-chat.ts        read chat + messages + variants + persona/character names →
│                              buildChatJsonl / buildChatTxt
├── substrate/          PURE feature-local (server-only; zero I/O)
│   ├── chat-jsonl.ts   buildChatJsonl · buildChatTxt · formatStDate (ST human date, UTC)
│   └── download-slug.ts slug (filename-safe ≤60 char download slug)
└── (no persistence/)   — each verb is one big entity-specific read against @orb/db; there
                          is no shared read primitive to factor out (the README's own note)
```

**The shared serde core lives OUTSIDE this tree** (export composes it; it is not
export-owned — see `core/Core-Legacy-Migration-and-Gaps.md` §1–§3):

```
@orb/server/kit/serde/card          buildCardV3 (OUT) + cardFromJson (IN) + ExportCardFields
@orb/server/kit/serde/world-entry   exportBookEntry (OUT) + loreEntryColumns/Metadata (IN)
@orb/kit/png-card-chunk             writeCardChunk · readCardChunk · isPng (string-based)
@orb/contracts/character            CharacterCard · characterCardV3Schema · CHARA_CARD_V3_SPEC
@orb/kit/message-role               messageRoleFromSt · messageRoleToSt (the ST bimap)
@orb/db/kit                         fetchOwned (OwnedTable)        @orb/db   parseRecord, schema
```

**No `errors.ts`, no `persistence/`** — deliberate, carried over: a missing/unowned entity
returns `null` (the HTTP layer maps to 404), and each verb's single big read needs no
shared persistence indirection. The two `substrate/` files are the only pure feature-local
code; everything serde is the shared core.

---

## Public surface (`index.ts`)

```typescript
// Service contract (consumed by entry/http via service-method-signature inference)
export type { ExportService, ExportChatFormat } from "#domain/export/contract/service";

// Factory
export { createExportService } from "#domain/export/service";
```

`createExportService(db, cas)` is wired at the composition root (`entry/`) and handed to the
download registrar `entry/http/export.ts`, which imports this front door **only**. The pure
serde core (card/world-entry mappers, PNG codec, the canonical card) is NOT re-exported here —
those are imported from their own packages by the verbs, not surfaced through export's door.

---

## Movement table

Every unit: where it goes, why, and what enforcement tier makes a violation RED.

| Unit                                                                                                              | Outcome                                              | Target                                                                                                                             | Rationale                                                                                                                                                                                                                                                                                                               | Enforcement tier                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `_shared/serde/card-serde.ts` — `buildCardV3` (strict V3 OUT emitter) + internals                                 | **→ shared serde core**                              | `@orb/server/kit/serde/card`                                                                                                       | The OUT half of the ONE card mapper; export calls it, import calls its IN partner `cardFromJson` in the same module. Kills the drift — one emitter, no parallel mapper possible.                                                                                                                                        | resolve-time: one exported symbol; `@orb/server/kit` is a declared dep + the round-trip is test-pinned         |
| `_shared/serde/card-serde.ts` — `cardFromJson` (tolerant IN adapter)                                              | → shared serde core (import's half, co-located)      | `@orb/server/kit/serde/card`                                                                                                       | Export doesn't call it but it is the round-trip partner; living adjacent to `buildCardV3` is what makes "emit re-parses cleanly" a one-file invariant.                                                                                                                                                                  | test-time: round-trip test (`buildCardV3` → `cardFromJson` identity)                                           |
| `_shared/serde/card-serde.ts` — `characterCardV3Schema`, `CharacterCardV3`, `CHARA_CARD_V3_SPEC`, `CharacterCard` | **→ `contracts`**                                    | `@orb/contracts/character`                                                                                                         | The one canonical card shape (§7.3 LOCKED). The schema is cross-boundary (server emits, client renders/validates); `kit` may not hold it (kit ← contracts). The serde core imports it downward.                                                                                                                         | resolve-time: `kit` cannot import `contracts`; the schema is in contracts, the string codec stays kit-pure     |
| `_shared/serde/card-serde.ts` — `ExportCardFields` (the `Pick` projection)                                        | → shared serde core (serde-internal input)           | `@orb/server/kit/serde/card`                                                                                                       | The serde's own input shape (live columns → wire); not a wire type itself. Lives with the mapper.                                                                                                                                                                                                                       | lint-time: `no-inline-types` (it's a `contract`-adjacent shape but serde-private)                              |
| `_shared/serde/world-entry-serde.ts` — `exportBookEntry` (+ `loreEntryColumns`/`loreEntryMetadata` IN)            | **→ shared serde core**                              | `@orb/server/kit/serde/world-entry`                                                                                                | The WI-entry OUT mapper, shared with import. Owns the `constant→scopeMode:"always"` and at-depth `position:4` round-trip in one place (was hand-duplicated).                                                                                                                                                            | resolve-time: one module, `@orb/server/kit` dep                                                                |
| `_shared/png-card-codec.ts` — `writeCardChunk`, `readCardChunk`, `isPng` (+ `crc32`/`makeChunk`/`PNG_SIGNATURE`)  | **→ `kit`**                                          | `@orb/kit/png-card-chunk`                                                                                                          | Pure byte/string engine; **string-based so it never imports the card type** → stays kit-pure. Collapses the 2 chunk-walks + 3rd inline `isPng`. Drops the steady `node:buffer` import (base64/latin1 over `Uint8Array`).                                                                                                | resolve-time + `kit-purity` gate (no domain/contracts import; **NO `node:*` at all** — `node:buffer` included) |
| ST role map `{0:system,1:user,2:assistant}` (in `world-entry-serde` via `injectionRole*`)                         | **→ `kit`**                                          | `@orb/kit/message-role` (`messageRoleFromSt`/`messageRoleToSt`)                                                                    | The bimap was written 4×; one copy. The serde imports it; export never re-spells it.                                                                                                                                                                                                                                    | resolve-time: one importable bimap; §7.5 `no-inline-union-redecl`                                              |
| `export/verbs/export-character.ts` — the assembly (db reads + book walk + buildCardV3 + writeCardChunk + basePng) | **stays domain feature**                             | `domain/export/verbs/export-character.ts`                                                                                          | The OUT assembly + db reads + packaging are export's job; it reads `@orb/db` directly (sanctioned bulk serializer, same as import).                                                                                                                                                                                     | resolve-time: `@orb/db` is a declared dep of `@orb/server`                                                     |
| `export/verbs/export-chat.ts` — the assembly (db reads + variant fold + builders)                                 | **stays domain feature**                             | `domain/export/verbs/export-chat.ts`                                                                                               | Same: chat interchange assembly + direct db reads.                                                                                                                                                                                                                                                                      | resolve-time                                                                                                   |
| `export/chat.ts` — `buildChatJsonl`, `buildChatTxt`, `formatStDate`                                               | stays domain feature (relocated)                     | `domain/export/substrate/chat-jsonl.ts`                                                                                            | Pure, **server-only** (no production client consumer — the client uses `/api/export/chat` hrefs, not the builders), single owner → substrate, not `server/kit`.                                                                                                                                                         | lint-time: `feature-structure` (pure helper → `substrate/`)                                                    |
| `export/chat.ts` — `ExportChatMeta`, `ExportMessage`, `ExportVariant` (inline interfaces)                         | stays domain feature (relocated)                     | `domain/export/contract/params.ts`                                                                                                 | Exported types declared outside `contract/` today; the serde-input shapes for the chat builders.                                                                                                                                                                                                                        | lint-time: `no-inline-types` / `types-in-contract`                                                             |
| `export/helpers.ts` — `slug` (download filename)                                                                  | stays domain feature                                 | `domain/export/substrate/download-slug.ts`                                                                                         | Filename policy specific to export downloads (distinct from `kit/slug`'s `slugifyHandle`).                                                                                                                                                                                                                              | lint-time: `feature-structure`                                                                                 |
| `export/helpers.ts` — `strArr` (coerce unknown → string[]) + `export-character.ts` `parseRecordArray`             | **→ `kit`** (dedupe)                                 | `@orb/kit/json` (or `kit/arrays`)                                                                                                  | `strArr` duplicates `strArray` in card-serde; `parseRecordArray` duplicates the regex-scripts coerce. One generic primitive; delete the copies.                                                                                                                                                                         | lint-time: `no-inline-types` + dup-finder                                                                      |
| `export/context.ts` — `ExportContext = ReturnType<typeof createExportContext>`                                    | stays domain feature (made explicit)                 | `domain/export/context.ts` top — `export interface ExportContext { db: Db; cas: Cas }`                                             | The inferred type is invisible; an explicit interface is the no-inline-types target (same fix as `character.md`).                                                                                                                                                                                                       | lint-time: `no-inline-types`                                                                                   |
| `_shared/fetch-owned.ts` — `fetchOwned` (used by `exportCharacter`; `exportChat` uses `requireHost` — D29)        | **→ `@orb/db/kit`**                                  | `@orb/db/kit` (`OwnedTable` constraint)                                                                                            | Owner-scoped single-row fetch for the owned `exportCharacter`; needs drizzle column types → db/kit, not kit. `ownerId` → `principal.userId` under §7.1. `exportChat` does NOT use it (chats are membership-scoped, D18 — it gates `requireHost`).                                                                       | resolve-time: `@orb/db/kit` below `@orb/server`                                                                |
| `#db/parsers` — `parseRecord`                                                                                     | stays `@orb/db`                                      | `@orb/db`                                                                                                                          | The JSON boundary parser used at every row→view seam; export reads it directly as a db consumer.                                                                                                                                                                                                                        | resolve-time                                                                                                   |
| `creator`/`character_version`/`regex_scripts`/`extensions` — survive only via `raw` blob                          | **→ typed columns**                                  | `@orb/db/schema/character` (the flat `characters` row, D28)                                                                        | The §7.3 lossiness fix: app-authored cards (no `raw`) must round-trip identically. Export reads each typed column off the row. Owned by `character` schema; export consumes.                                                                                                                                            | compile-time: typed columns are the schema source; a `raw`-only read is the absence of a column                |
| `character_versions.proposedTags` read → card `tags`                                                              | **→ accepted `character_tags`**                      | read `character_tags WHERE status='accepted'` (`domain/tag` redesign)                                                                  | Closes the round-trip gap — accepted tags now export; `proposedTags` JSON column is deleted. (Behavioral shift, see Open decisions / Esoteric.)                                                                                                                                                                         | compile-time: `proposedTags` column absent → `tsc` red at any read site                                        |
| `export-chat.ts` reads `chat.characterVersionId` (for the character name)                                         | **rewrite — resolve off the flat character row**     | chat → `characterId` → `characters.name` (direct read)                                                                             | D28 removes the version model entirely: there is no `chats.characterVersionId` (and no version to resolve); export reads the character name straight off the `characters` row.                                                                                                                                          | compile-time: column gone → `tsc` red                                                                          |
| `export-chat.ts` reads `chat.personaId ?? chat.pinnedPersonaId` (for the user name)                               | **rewrite — resolve via participant active persona** | participant active-persona resolution (`domain/persona` drops `chats.personaId`)                                                       | `domain/persona` target: active per-participant, anchor per-chat; `chats.personaId` is dropped.                                                                                                                                                                                                                             | compile-time: column gone → `tsc` red                                                                          |
| `export-character.ts` book walk joins `characterBooks.characterVersionId`                                         | **rewrite — identity-keyed (D28)**                   | `character_books.characterId = characters.id` (re-keyed); export reads the live card's book set off the flat row (no version join) | RESOLVED (`character.md` + `domain/world-info`): D28 collapses the version model, so `character_books` re-keys to `characters.id` and the book set is simply the live card's books, read at assemble — there is no cv pin to resolve. Export reads books by `characterId`.                                                  | compile-time: the cv-keyed FK is gone post-migration                                                           |
| `http/export.ts` — `registerExportRoutes` (binary/text download registrar)                                        | **→ entry tier**                                     | `entry/http/export.ts`                                                                                                             | A non-tRPC download registrar; calls the export front door only, streams bytes/text with a download header.                                                                                                                                                                                                             | resolve-time: `entry`/`transport` → domain front door (dep-cruiser backstop)                                   |
| `export-character.ts` — `basePng` (jpg/webp→png transcode + placeholder) + `cas.read`                             | stays domain feature (transcode INJECTED — PD-74)    | `domain/export/verbs/export-character.ts`; the transcode is the injected `infra/image` `imageTransform` op (D6)                    | The avatar→base-PNG packaging is export-specific assembly; `cas` + `imageTransform` are injected via context. The extract-to-`infra/image` criterion was met at build time (`infra/image` exists; `assets` consumes it), so export never imports `sharp` — the sealed adapter is composed at the root (PD-74 resolved). | resolve-time: `cas`/`imageTransform` injected; sharp stays sealed in `infra/image`                             |
| `resolveCharacterDepthPrompt(v.depthPrompt)` call before `buildCardV3`                                            | **→ `@orb/server/kit/serde`** (RESOLVED)             | `@orb/server/kit/serde`                                                                                                            | Server-only (zod), TWO consumers (export + chat/assembly) → `server/kit/serde`, not a single domain's substrate. Deferred refinement: fold the unknown→`{prompt,depth,role}` coercion into the serde-out path so the export verb reads the typed `depthPrompt` column directly (do this iff it leaves a single caller). | resolve-time (both consumers import down)                                                                      |

---

## Cross-feature composition (the injection model)

**Export is injection-light by design.** Unlike `chat` (which injects half a dozen domain
ops), export is a bulk serializer: it reads `@orb/db` schema **directly** and composes the
pure serde core. The composition root wires only **two runtime deps** — `db` and `cas` — and
everything else is a static import of a lower-tier module.

**Wired at the composition root (`entry/`):**

| Dep                           | Provided by   | Used for                                                                                        |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `db` (`@orb/db` client)       | entry         | all canon reads (card, books, accepted tags, chat, messages, variants, persona/character names) |
| `cas` (`@orb/server/storage`) | infra/storage | the avatar blob read in `basePng` (one read attempt — the TOCTOU-safe pattern)                  |

**Statically composed (no injection — lower-tier imports):**

| Composed module                                         | Tier       | Used for                                          |
| ------------------------------------------------------- | ---------- | ------------------------------------------------- |
| `@orb/server/kit/serde/card` (`buildCardV3`)            | server/kit | live columns → V3 wire card                       |
| `@orb/server/kit/serde/world-entry` (`exportBookEntry`) | server/kit | live entry → ST `character_book` entry            |
| `@orb/kit/png-card-chunk` (`writeCardChunk`)            | kit        | card JSON string → PNG bytes                      |
| `@orb/contracts/character` (`characterCardV3Schema`)    | contracts  | the canonical card shape the serde parses against |
| `@orb/db/kit` (`fetchOwned`)                            | db/kit     | owner-scoped single-row guard                     |

**Why no domain injection (and the D28 consequence):** the character name + book set +
accepted tags that `exportCharacter` needs are all reachable by **direct db reads** off the
flat `characters` row (`characters` → `character_books` → `character_tags`), exactly as
`character.md` sanctions ("import/export bypass the front door by reading `@orb/db`
directly"). D28 collapses the version model: there is no `currentVersionId` join and no
`chats.characterVersionId` pin to resolve — export reads card content straight off the
`characters` row, not by injecting `character.getCard`. The bulk serializer reads
schema; business-logic callers go through front doors.

---

## Spine thread intersections

### §7.3 serialization / serde core

This is the domain's spine. Export is the **OUT half** of the one core; import is the IN
half. The card mapper (`buildCardV3` ⟷ `cardFromJson`), the WI-entry mapper
(`exportBookEntry` ⟷ `loreEntryColumns`/`loreEntryMetadata`), and the PNG codec
(`writeCardChunk` ⟷ `readCardChunk`) are emit/read **pairs living adjacent** so the
round-trip is a one-file invariant, not a cross-domain test contract. The canonical card is
fully modeled in `@orb/contracts/character` (creator/cardVersion/regex_scripts/extensions are
typed columns, not `raw`-blob survivors); `raw` is reserved for genuinely-unknown vendor
extras. Export reads the typed columns off the flat `characters` row (D28); the serde maps them to the V3
wire; the codec writes the dual chunk. **Already clean (don't touch):** the parse/write
split, the string-based codec, the round-trip test pins.

### §7.4 types & schemas — one home, one direction

- `CharacterCard` / `characterCardV3Schema` / `CHARA_CARD_V3_SPEC` → `@orb/contracts/character`
  (cross-boundary wire; the one card).
- `ExportChatMeta` / `ExportMessage` / `ExportVariant` → `domain/export/contract/params.ts`
  (serde-input shapes; today inline in `chat.ts` — a `no-inline-types` leak).
- `ExportCardFields` → the serde module (`@orb/server/kit/serde/card`) — serde-private input.
- `ExportContext` → explicit named interface, not `ReturnType<>`.
- `ExportService` / `ExportChatFormat` → `domain/export/contract/service.ts`
  (domain-internal; re-exported from the front door for the entry registrar).
- DB-row types (`typeof characters.$inferSelect`, `messageVariants.$inferSelect`) →
  stay derived from `@orb/db` schema in the verbs (no leak; a db-row type).

### §7.5 string-union dispatch discipline

- **`ExportChatFormat = "jsonl" | "txt"`** — one importable canonical union in
  `contract/service.ts`; dispatched once in `export-chat.ts` (`format === "txt"` else jsonl).
  Two members, two sites — below the `no-inline-union-redecl` threshold (the gate fires only on
  ≥3-member unions, ledger §5), so it is exempt; kept as one canonical union by convention, no
  inline re-spelling.
- **`MessageRole`** (`system | user | assistant`) — the at-depth role on exported
  book entries comes through `@orb/kit/message-role`'s bimap; export never re-declares the
  3-member union (it was part of the 4× role-map antipattern).
- **`message.role`** (`user | assistant | system`) read in `export-chat.ts` and mapped to
  ST's `is_user` / `is_system` booleans — the read must use the canonical `MessageRole` union
  from `@orb/kit/message-role` (the type/tuple home; the `z.enum` wire schema `messageRoleSchema`
  is `@orb/contracts/chat`, §5), not an inline re-spelling (this axis is the measured 132-touch pain).

### §7.1 identity / auth / permission

The two verbs gate **differently** (D18/D29). **`exportCharacter`** is owner-scoped: it gates through
`fetchOwned` (owner-equality on the single-owned `characters` row). **`exportChat`** is
membership-scoped: chats have no `ownerId` (D18), so it gates `requireHost(principal, chatId)` — bulk
transcript extraction is a host action in v1 (D29; widening to `requireParticipant` is deferred-additive).
Both take a `Principal` (§7.1); `exportCharacter`'s `fetchOwned` reads `principal.userId`, `exportChat`
resolves the host from the loaded roster. The download
routes resolve the caller via the SAME auth seam as tRPC (`resolveOwner`); safe GET downloads
carry no CSRF requirement (preserve this — it's a deliberate transport decision).

---

## Esoteric / load-bearing quirks to preserve

**PNG dual-chunk write** (`png-card-chunk.writeCardChunk`): the card JSON is embedded as
**BOTH** a `chara` (V2) and a `ccv3` (V3) `tEXt` chunk — **V2 first, V3 second, both before
IEND**. A V2-only importer reads `chara` and ignores `ccv3`; a V3-aware importer prefers
`ccv3`. The V2 chunk is the same blob with the top-level `spec`/`spec_version` keys stripped.
CRC-32 uses poly **`0xedb88320`** (table built once); the keyword is null-separated from a
**base64** value, and the `keyword\0value` layout round-trips byte-for-byte through **latin1**
(base64 is ASCII). Stale `chara`/`ccv3` chunks are dropped on write so a re-export never
carries duplicates. **Throws** if the base image isn't a PNG or has no IEND. Do not "simplify"
to a single chunk — the dual write is the cross-tool compatibility convention.

**Round-trip-pinned `buildCardV3` → `cardFromJson`**: the strict OUT emitter's output must
re-parse cleanly through the permissive IN adapter. This is the one invariant that makes
import→export→reimport lossless; it is why the two halves live adjacent in one serde module.
Any change to the emitted shape must keep the round-trip test green.

**At-depth `position:4` re-encode** (`world-entry-serde.exportBookEntry`): a depth-injection
directive on a live entry is mirrored back into ST's `extensions.{position:4, depth, role}`
encoding (with `role` mapped through the bimap), and `constant` derives from the resolved
scope (`scopeMode:"always"` OR the keyless-entry heuristic — vanilla ST needs `constant:true`
for a keyless always-on entry to fire). The metadata blob is spread as the base so a
round-trip doesn't strip fields the typed columns don't cover; typed columns override the keys
they own. This is the one place the at-depth encoding is written — preserve it.

**The accepted-tags round-trip fix** (the behavioral shift): today `card.tags = proposedTags`
(the staging surface) and accepted `character_tags` are NOT serialized — a known round-trip
gap. Orbweaver flips this: `proposedTags` is deleted; `card.tags = character_tags WHERE
status='accepted'`. **Consequence to flag:** a freshly-imported card whose tags arrived as
`status:'pending'` (per `domain/tag`, import writes pending rows) and were never accepted will
**not** re-export its tags until the user accepts them — the opposite of today, where proposed
tags always re-export. This is the intended design (accepted = canonical), but it is a visible
semantic change in the import→export round-trip; document it for the migration.

**ST human date format** (`chat-jsonl.formatStDate`): chat JSONL emits dates in the legacy
human form (`"August 27, 2025 6:36pm"`, UTC) so a re-import into a vanilla legacy reader
renders a readable date. The neo importer's `parseStDate` handles all of {epoch ms · ISO ·
`"2025-07-03@14h56m48s"` · this human form}, so our own round-trip is unaffected. Keep the
UTC + human form; it is a deliberate cross-tool nicety.

**Swipe arrays only when >1 variant** (`buildChatJsonl`): `swipes`/`swipe_id`/`swipe_info`
are emitted only when a message has more than one variant — matching the parser's
`swipes.length > 1` gate. A single-variant turn stays clean and re-imports without a swipe
array. The TXT transcript emits **only the active variant** (a transcript shows what was said,
not the re-rolls).

**Branch-graph + author's-note round-trip** (audit P0 #5, `export-chat.ts`): `parentRef` = the
parent chat's `importedFrom` source filename (the key import relinks branches on); `notePrompt`
= the ST author's note stashed at import time (read through `parseRecord`, not a structural
cast). Both drop to null when the parent was never imported or the chat has no parent. This
preserves the branch graph + note across import→export→import; keep the `parseRecord` boundary
read (a malformed/legacy row → null, not a throw).

**`basePng` TOCTOU-safe avatar read** (`export-character.ts`): the avatar blob is read with a
**single `cas.read` attempt** (not `cas.exists` THEN `cas.read` — that was a TOCTOU race where
a concurrent GC pass could remove the blob between the two calls). `ENOENT` falls through to a
256×256 placeholder; any other error throws. Non-PNG avatars are transcoded jpg/webp→png via the
injected `infra/image` `imageTransform` op (PD-74). Preserve the one-read pattern.

**What export owns vs what is shared** (the line to hold): export owns the **assembly** (which
rows to read, how to fold variants, which tags attach to the card), the **db reads** (direct
`@orb/db`, sanctioned), and the **packaging** (basePng, slug, the bytes/text envelope, the
future bulk zip). It does NOT own the **mappers** (`buildCardV3`/`exportBookEntry` →
server/kit), the **codec** (`writeCardChunk` → kit), the **canonical card** (→ contracts), or
the **role bimap** (→ kit). Cross this line and the gate goes red: an export-local card mapper
re-emerging is a second emitter (the drift this domain exists to kill).

---

## Invariants (gate candidates)

1. **One card mapper, one direction-pair.** `buildCardV3` (OUT) and `cardFromJson` (IN) are
   the only card mappers, co-located in `@orb/server/kit/serde/card`. No export-local card
   emitter.
   _Enforcement: resolve-time (one exported symbol; both domains import it) + test-time
   (round-trip identity test)._

2. **The PNG codec is string-based and kit-pure.** `writeCardChunk`/`readCardChunk` take/return
   the card JSON as a STRING, operate on `Uint8Array`, and never import the card type OR `node:buffer`.
   _Enforcement: `kit-purity` gate (no domain/contracts import; **no `node:*` import at all**)._

3. **No `raw`-blob-only provenance.** `creator`/`cardVersion`/`regexScripts`/`extensions` are
   typed columns on the flat `characters` row (D28); export reads the columns, not `raw`. An app-authored
   card (no `raw`) round-trips identically.
   _Enforcement: compile-time — the typed columns are the schema source; a `raw`-only read is
   the absence of a column._

4. **Accepted tags export; `proposedTags` does not exist.** The card's `tags` come from
   `character_tags WHERE status='accepted'`. No `proposedTags` column anywhere (and no
   `character_versions` table — D28).
   _Enforcement: compile-time (column absent → `tsc` red) — shared with `domain/tag` invariant 4._

5. **Export resolves the character name off the flat character row.** `exportChat` resolves the
   character name via `chat → characterId → characters.name`, not a `chats.characterVersionId` pin.
   _Enforcement: compile-time — `chats.characterVersionId` is gone (D28 — there is no version
   model at all); any read is a `tsc` error._

6. **Export reads `@orb/db` directly; it does not inject domain services.** The bulk
   serializer's only runtime deps are `db` + `cas`. No `domain/export` import of another
   domain's front door for read data.
   _Enforcement: lint-time (dep-cruiser `domain-no-cross-feature`) + the sanctioned-db-reader
   exemption (same as import)._

7. **The download routes are entry-tier and call the front door only.**
   `entry/http/export.ts` imports `domain/export/index.ts` (the `ExportService` type +
   factory), nothing internal.
   _Enforcement: resolve-time (`entry` → domain front door) + dep-cruiser backstop._

8. **The dual-chunk byte contract is fixed.** chara(V2)+ccv3(V3), V2 first, both before IEND,
   CRC-32 `0xedb88320`, base64 value via latin1.
   _Enforcement: test-time (a golden-bytes test on `writeCardChunk` output; a round-trip read
   through `readCardChunk`)._

---

## Resolved decisions (was: open)

- **The proposed→accepted card-tags re-export semantics — RESOLVED: export accepted-only.**
  `card.tags = character_tags WHERE status='accepted'` (per `domain/tag`). A
  freshly-imported-but-not-accepted card does NOT re-export its (pending) tags until accepted —
  the reverse of today, intended (accepted = canonical). Pending tags are NOT serialized. The
  behavioral shift stays documented (Esoteric §"accepted-tags round-trip fix") for migration; it
  is no longer an open question. (Same resolution as `core/Spine-Config-and-Serialization.md` + `domain/tag`.)

- **`character_books` FK + book walk — RESOLVED: identity-keyed, current-version resolution.**
  `character_books` re-keys to `characters.id` (`character.md` + `domain/world-info`); export resolves
  the live book set by `characterId` (no cv join). The snapshot guarantee is re-provided by
  current-version resolution (the simple default), not a chat-level version pin. A future
  freeze-lore-at-version-X feature would be a separate snapshot junction, not a cv pin.

- **`resolveCharacterDepthPrompt` home — RESOLVED → `@orb/server/kit/serde`.** Server-only (zod),
  TWO server consumers (export + chat/assembly), so a `character/substrate` home would force a
  cross-feature import. Consistent across `Core-Legacy-Migration-and-Gaps.md` §5 (CORRECTED 2026-06-25 →
  `server/kit`), `character.md` §7.3 movement, and `domains/chat.md`. Deferred refinement: fold the
  coercion into the serde-out path so the export verb reads the typed `depthPrompt` column directly
  — iff it leaves a single caller.

### Still open (deferred, with criteria)

- **Bulk / library zip export — DEFERRED (not in the initial port).** _Criterion to build:_ when a
  "download my library" surface is wanted — add `exportLibrary` (zip of N card PNGs / N chat
  JSONLs) to export's packaging layer (`export/substrate/` + a streaming `entry/http` route). The
  serde core is unchanged; only the packaging layer grows. (Mirrors `core/Spine-Config-and-Serialization.md` §5.)

- **`sharp` placement — RESOLVED (PD-74): the injected `infra/image` adapter.** The extract
  criterion ("iff a SECOND domain needs image transcode") was already met when this slice was
  built — `infra/image` (the sealed sharp adapter, D6) exists and `domain/assets` consumes it —
  so `basePng`'s jpg/webp→png transcode goes through the injected `imageTransform` op; export
  never imports `sharp` (the infra seal holds). The placeholder stays a domain constant
  (`substrate/placeholder-png.ts` — the adapter transcodes existing images, it doesn't
  synthesize them).
