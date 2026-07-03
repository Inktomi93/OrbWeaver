# Orbweaver — `character`: the flat live card + a git-commit history

> **Status: planning (authoritative detail).** The character domain owns the character — a **FLAT
> `characters` row that IS the card** (live identity + content in one place) — plus a standalone
> **`character_snapshots` history** (git-commit-style: browse + restore, but **nothing gates on it**).
> The defining change from neo-tavern: **`character_versions` is GONE (ledger D28)** — no version table,
> no cv pin, no copy-on-write, no `resolveCurrentVersion`. Everything references `characters.id` (the live
> card); history is an opaque snapshot log you can restore in-place. This doc is the target spec.
> Authoritative upstream: `Core-Laws-and-Precedents.md` D28, `participants-agents-identity.md` §4, `domains.md`.
> `Core-0-Architecture-and-Structure.md` §4 is the 8-slot template this domain follows.

---

## What this domain owns

- **The character — a FLAT `characters` row that IS the card** (D28): identity (`id`, `handle`, `ownerId`,
  `starred`, `archived`, `synthetic`, `forbidExternalMedia`, `importedFrom`, `importHash`, `contentHash`,
  `createdAt`) **+ all card content on the same row** (`name`, `description`, `personality`, `scenario`,
  `greetings`, `exampleMessages`, `systemPrompt`, `postHistoryInstructions`, `depthPrompt`, `creatorNotes`,
  the typed promotions `creator`/`cardVersion`/`regexScripts`/`extensions`, `avatarAssetId`, refinery
  signals). **No `currentVersionId`, no `version` counter, no `character_versions` table** (D28). The card
  tags surface is the `character_tags` junction (`domain/tag`), not a `proposedTags` blob. `raw` stays dropped.
- **`character_snapshots` — the history log (NEW, D28)** — append-only `{id, characterId (FK CASCADE),
content (JSON = the full card snapshot), label?, createdAt}`. **NOTHING FKs it** (it's opaque history,
  not the content home). It's the git "commit log": browse it, restore from it. A snapshot is taken on a
  manual "save a version" and (optionally) before a destructive edit/restore.
- **Character-persona junction** — `character_personas` (identity-keyed on `characters.id`).
- **Card mutations** — `create`, **edit-in-place** (the card is the live row — always safe, no CAS, no
  COW), `snapshot` (append to `character_snapshots`), `restore` (copy a snapshot's blob → the live row
  in-place; snapshot-current-first so restore is reversible). The whole COW/CAS/`forkVersion`/
  `versionPinned` machinery is **gone** (it existed only because chats pinned a cv).
- **Default card seeder** — idempotent boot-time pack of well-known cards (the WELCOME_ASSISTANT
  among them), using the real service path.
- **Character CRUD** — `create`, `get`, `list`, `update`, `remove`, `duplicate`, `bulkRemove`,
  `bulkArchive`, `bulkAddCardTag`.
- **Synthetic group characters** — the `synthetic=true` hidden identity minted per-room for
  scoped-group memory buckets (§11.5 of the group-chat plan). In orbweaver this verb lives here, not
  in `_shared`, composed into `chat` via the injection model.
- **`getCard(characterId)`** — the live-card read (replaces neo's `resolveCurrentVersion`; D28). With no
  versions, "resolve the current version" is just "read the `characters` row" — the card IS the row. Chat
  calls it through the injected cross-feature op (per roster member, at ASSEMBLE RESOLVE).

This domain does **not** own: embeddings of card text (that is `embeddings`); book-scope junctions
(that is `world-info`; the junction FKs `characters.id` — D28); tag junctions (that
is `tag`); persona definitions (that is `persona`); the serialization mapper for import/export (that
is `import`+`export` sharing a serde core that reads `@orb/db` directly, same as today).

---

## The model: flat live card + a history log nothing gates on (locked, D28)

> **There are no character versions.** The card IS the `characters` row (live, edited in place).
> Everything references `characters.id`. History is a standalone `character_snapshots` log that NOTHING
> FKs — browse it, restore from it in-place. The git working-tree + commit-log split.

This is the load-bearing simplification — it deletes the entire cv-tangle. What changes from neo-tavern:

| neo-tavern                                                               | orbweaver (D28)                                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `character_versions` table holds the card; `characters` is just identity | **`character_versions` GONE** — the card content is on the flat `characters` row                                                        |
| `chats.characterVersionId NOT NULL` — a chat welded to a cv              | gone (de-pin)                                                                                                                           |
| `characters.currentVersionId` + circular FK + `version` counter          | **gone**                                                                                                                                |
| `cow.ts` (`versionPinned` / `forkVersion` / `editVersionInPlace` CAS)    | **deleted** — edit-in-place is always safe                                                                                              |
| `resolveCurrentVersion`                                                  | **gone** — `getCard(characterId)` reads the row                                                                                         |
| Versions = immutable rows in a table everything FKs                      | **history = `character_snapshots`** (JSON blobs, nothing FKs them); `snapshot` appends, `restore` copies a blob → the live row in-place |

What **survives**:

- `create` (the first-write path), `removeCharacterWithCleanup` (pre-cascade asset-id snapshot + delete +
  best-effort cleanup) — unchanged logic.
- `character_personas` (identity-keyed — always was; correct).

**`character_books` keys on `characters.id`** (D28 — no cv exists). Book sets are the live card's; they
change only on a deliberate edit (snapshot-able like any card content). A future "freeze lore at a
snapshot" feature would reference a `character_snapshots` id, never a cv.

---

## The 8-slot layout

```
domain/character/
├── index.ts                  FRONT DOOR — the only legal external import
├── service.ts                COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts                DI BUNDLE — typed CharacterContext interface (explicit — not ReturnType<>)
├── contract/
│   ├── service.ts            CharacterService interface — read this to know everything the domain does
│   ├── params.ts             every verb's *Params (CardEdits sub-shape — flat, one card; no Cv/Id split)
│   ├── results.ts            every verb's *Result
│   ├── views.ts              CharacterDetail, CharacterSummary — what the client receives
│   └── errors.ts             CharacterNotFoundError, CharacterOperationError
├── verbs/
│   ├── create.ts
│   ├── get.ts
│   ├── list.ts
│   ├── update.ts
│   ├── remove.ts
│   ├── duplicate.ts
│   ├── bulk-remove.ts
│   ├── bulk-archive.ts
│   ├── bulk-add-card-tag.ts
│   ├── snapshot.ts           NEW — append a character_snapshots history blob (the "git commit" verb)
│   └── restore.ts            NEW — copy a snapshot blob → the live card row in-place ("git checkout")
├── persistence/
│   ├── queries.ts            all SELECT/JOIN for this domain; re-exports isConstraintViolation shim
│   └── card.ts               writeCard (flat in-place edit, no CAS), appendSnapshot, removeCharacterWithCleanup
├── substrate/
│   └── card-tokens.ts        cardTokenSize (list-specific token-size estimate; local to the domain)
└── seeder/
    ├── index.ts              createDefaultCharacterSeeder, DefaultCharacterSeeder type
    ├── seed.ts               the idempotent boot pack (5 default cards); same two-layer idempotency
    └── cards.ts              DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE constants
```

**Named subsystem:** `seeder/` is the one internal subsystem — it has enough internal structure (in-process
memo + inFlight Map + the card definitions) to warrant its own folder rather than a flat verb file.

**`context.ts` — explicit interface:** the DI bundle type is `CharacterContext` as a named interface in
`contract/` (or inline at the top of `context.ts` as an exported interface), NOT a `ReturnType<>` inference.
The shape must be readable without hovering.

---

## Verbs (the `CharacterService` interface)

```
CharacterService = {
  // CRUD
  create(params: CreateCharacterParams): Promise<CharacterDetail>
  get(params: GetCharacterParams): Promise<CharacterDetail>
  list(params: ListCharactersParams): Promise<CharacterSummary[]>
  update(params: UpdateCharacterParams): Promise<CharacterDetail>
  remove(params: RemoveCharacterParams): Promise<void>
  duplicate(params: DuplicateCharacterParams): Promise<CharacterDetail>
  bulkRemove(params: BulkRemoveParams): Promise<void>
  bulkArchive(params: BulkArchiveParams): Promise<void>
  bulkAddCardTag(params: BulkAddCardTagParams): Promise<void>

  // History (git working-tree + commit-log; gates nothing)
  snapshot(params: SnapshotParams): Promise<SnapshotRef>       // append a character_snapshots blob
  listSnapshots(params: ListSnapshotsParams): Promise<SnapshotSummary[]>  // browse history
  restore(params: RestoreParams): Promise<CharacterDetail>     // copy a snapshot blob → live card, in-place

  // Card read (used by chat, roster, memory) — the card IS the row
  getCard(params: GetCardParams): Promise<CharacterCard | null>

  // Member-visible card view (membership-gated, level-clamped — D22)
  getRosterCardView(params: RosterCardViewParams): Promise<MemberCardView | null>

  // Synthetic identity (group-memory bucket)
  mintSyntheticGroupCharacter(params: MintGroupCharParams): Promise<CharacterRef>
  findSyntheticGroupCharacter(params: FindGroupCharParams): Promise<CharacterRef | null>
}
```

**The member card view (D22 — host-toggleable card visibility).** `get`/`update`/`duplicate`/`remove`/export are
**owner-only** (`fetchOwned` → 404 for non-owners) — viewing ≠ owning, so a member can never edit/clone/export
another's card. A human MEMBER of a chat reads a roster character's card through the SEPARATE, membership-gated
`getRosterCardView(principal, chatId, characterId)`: it `requireParticipant`s, then returns a `MemberCardView`
**clamped to `chatMetadata.group.memberCardVisibility`** (`name-avatar | sheet | sheet+lore | full`, host-set per room,
seeded from `userSettings.groupDefaults`, default `sheet`; **`name-avatar`** = name+avatar floor, **`sheet`** =
presentable identity, **`sheet+lore`** = + lorebooks, **`full`** = + steering internals). Read-only + while-present
(`leftSeq IS NULL`); the **owner/host always sees `full`** (it's their card — they call `get`). The host owns the cast
(member-contributed characters stay rejected), so this toggle is the owner controlling their own cards' exposure.
_(Reserved, not v1: a per-character cap `maxMemberVisibility` so a sensitive card is ceilinged regardless of room level —
effective `min(room, cap)`.)_

**Cross-verb injection:** `bulkAddCardTag` receives the `update` verb as an injected dep (wired at
`service.ts`); that injection type lives in `contract/service.ts`, not inline in the verb.

---

## Public surface (`index.ts`)

```typescript
// Errors
export { CharacterNotFoundError, CharacterOperationError } from "./contract/errors";

// Input types
export type { CreateCharacterParams, UpdateCharacterParams } from "./contract/params";

// Zod schemas (wire validation — re-exported from @orb/contracts in orbweaver)
export { createCharacterSchema, updateCharacterSchema } from "@orb/contracts";

// Service types
export type { CharacterService, CharacterServiceDeps, CharacterContext } from "./contract/service";

// View types (what the client receives)
export type { CharacterDetail, CharacterSummary } from "./contract/views";

// Seeder
export {
  createDefaultCharacterSeeder,
  WELCOME_ASSISTANT_HANDLE,
  DEFAULT_CHARACTER_CARDS,
} from "./seeder";
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps } from "./seeder";

// Factory
export { createCharacterService } from "./service";
```

**The Zod wire schemas (`createCharacterSchema`, `updateCharacterSchema`) live in `@orb/contracts`.**
In neo-tavern they live in `src/shared/character/character-schema.ts` because the client needs runtime
Zod and the dep-cruiser `client-no-backend-runtime` rule blocks importing from `server/`. In orbweaver
`@orb/contracts` is the explicit cross-boundary package for exactly this case — the client can declare
`@orb/contracts` as a dep. This is the right move; `shared/character/character-schema.ts` dissolves.

---

## Movement table

Every unit: where it goes, why, and what enforcement tier makes a violation RED.

| Unit                                                                                                | Outcome                              | Target                                                                                                                        | Rationale                                                                                                                                                                                                                                                                                                                                                                             | Enforcement tier                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `persistence/cow.ts` — `versionPinned` + `forkVersion` + `editVersionInPlace` CAS guard             | **deleted whole**                    | —                                                                                                                             | The entire COW file exists only because `character_versions` rows could be pinned by chats. D28 deletes the table; the card is the flat `characters` row, edited in place. Zero survivors.                                                                                                                                                                                            | compile-time: `character_versions` table gone → any reference fails `tsc`                                                      |
| `persistence/cow.ts` — `mintFirstVersion` → `writeCard` + `removeCharacterWithCleanup`              | stays domain feature                 | `domain/character/persistence/card.ts`                                                                                        | `mintFirstVersion` collapses into `create`'s flat-row insert (`writeCard`); cleanup logic survives unchanged.                                                                                                                                                                                                                                                                         | resolve-time (same package)                                                                                                    |
| `persistence/cow.ts` — `CvEdits`, `IdEdits` types                                                   | **collapsed to `CardEdits`**         | `domain/character/contract/params.ts`                                                                                         | The cv/identity split existed only because content lived on a separate version row. With one flat card there is ONE edit shape.                                                                                                                                                                                                                                                       | lint-time: `no-inline-types` dep-cruiser gate                                                                                  |
| `persistence/cow.ts` — `MintFirstVersionArgs`, `ForkVersionArgs` (→ gone), `RemoveCharacterCleanup` | **deleted / collapsed**              | `domain/character/contract/params.ts` (internal arg shapes)                                                                   | `ForkVersionArgs` deleted with fork; `MintFirstVersionArgs` folds into `CreateCharacterParams`. `RemoveCharacterCleanup` stays.                                                                                                                                                                                                                                                       | lint-time: `no-inline-types`                                                                                                   |
| `persistence/queries.ts` — `isConstraintViolation` re-export shim                                   | → `@orb/db` kit                      | `@orb/db/kit` or `@orb/server/kit`                                                                                            | A DB-error classifier — pure primitive, no domain knowledge. The re-export shim exists only because `create`/`update` import via `../persistence/queries`. In orbweaver import from `@orb/db` directly.                                                                                                                                                                               | resolve-time: package dep (undeclared import won't resolve)                                                                    |
| `persistence/queries.ts` — `fetchOwned` usage                                                       | → `@orb/server/kit` or `@orb/db/kit` | A db-kit helper                                                                                                               | Pure owner-scoped row fetch; domain-agnostic. Dissolve `_shared/fetch-owned.ts` here.                                                                                                                                                                                                                                                                                                 | resolve-time                                                                                                                   |
| `context.ts` — `ReturnType<>` inference (no explicit interface)                                     | stays domain feature                 | `domain/character/contract/service.ts` or `context.ts` top — as `export interface CharacterContext`                           | The inferred type is invisible. Explicit interface is the `no-inline-types` target.                                                                                                                                                                                                                                                                                                   | lint-time: `no-inline-types`                                                                                                   |
| `shared/character/character-schema.ts` — `createCharacterSchema`, `updateCharacterSchema` (Zod)     | → `contracts`                        | `@orb/contracts/character`                                                                                                    | Cross-boundary wire schema: server validates, client renders forms. `@orb/contracts` is the right package-tier home.                                                                                                                                                                                                                                                                  | resolve-time: `@orb/client` declares `@orb/contracts` dep, never `@orb/server`                                                 |
| `shared/character/character-schema.ts` — `resolveCharacterDepthPrompt`                              | → `@orb/server/kit/serde`            | `@orb/server/kit/serde/depth-prompt.ts`                                                                                       | **CORRECTED 2026-06-25** (verified): it has TWO server consumers — `export/verbs/export-character.ts` AND `chat/assembly/context.ts` — so a `character/substrate` home would force export + chat to cross-feature-import character (illegal). It's a pure server-only helper (uses zod internally → server/kit, not isomorphic kit) consumed by the serde-out path and chat assembly. | resolve-time (server/kit is below domain; both consumers import down)                                                          |
| `verbs/bulk-add-card-tag.ts` — `UpdateFn` type alias (inline)                                       | stays domain feature                 | `domain/character/contract/service.ts`                                                                                        | The injected cross-verb operation type belongs in the contract surface.                                                                                                                                                                                                                                                                                                               | lint-time: `no-inline-types`                                                                                                   |
| `chat/persistence/resolve-current-version.ts`                                                       | **deleted**                          | folded into `CharacterService.getCard` (a plain `characters`-row read in `persistence/queries.ts`)                            | With no versions there is nothing to "resolve" — reading the card is reading the row. Today's `chat/persistence` resolver is a cv-era workaround; in orbweaver chat calls the injected `getCard` op.                                                                                                                                                                                  | resolve-time: `chat` imports `character` front door only (dep-cruiser `domain-no-cross-feature` rule)                          |
| `_shared/group-character-rows.ts` — `buildGroupCharacterRows`                                       | → `domain/character`                 | `domain/character/verbs/mint-synthetic-group-character.ts`                                                                    | Chat mints a character without calling the character service today; the `_shared` drawer is the workaround for the cross-feature ban. In orbweaver the character domain owns identity creation; `mintSyntheticGroupCharacter` writes ONE flat `characters` row (no version row) and is injected into chat at the composition root.                                                    | resolve-time: `_shared` does not exist in orbweaver; dependency-cruiser `domain-no-cross-feature` enforces the injection model |
| `_shared/audit.ts` — `logAudit` (used by `create.ts`, `update.ts`)                                  | → `foundation`                       | `foundation/observability` or a `kit` primitive                                                                               | Cross-feature audit log; a foundation/infra concern. One of the `_shared` dissolve destinations.                                                                                                                                                                                                                                                                                      | resolve-time                                                                                                                   |
| `_shared/ids.ts` — `newTypeId`                                                                      | → `@orb/kit`                         | `@orb/kit/ids`                                                                                                                | Pure TypeID mint; zero I/O, zero domain. The canonical `kit` case.                                                                                                                                                                                                                                                                                                                    | resolve-time                                                                                                                   |
| `_shared/strip-undefined.ts`                                                                        | → `@orb/kit`                         | `@orb/kit/objects`                                                                                                            | Pure primitive; isomorphic.                                                                                                                                                                                                                                                                                                                                                           | resolve-time                                                                                                                   |
| `_shared/batch.ts` — `batchStmt`                                                                    | → `@orb/db`                          | `@orb/db/kit`                                                                                                                 | DB-layer primitive; no domain logic.                                                                                                                                                                                                                                                                                                                                                  | resolve-time                                                                                                                   |
| `_shared/db-errors.ts` — `isConstraintViolation`                                                    | → `@orb/db`                          | `@orb/db/kit`                                                                                                                 | DB-error classifier; no domain.                                                                                                                                                                                                                                                                                                                                                       | resolve-time                                                                                                                   |
| `verbs/list.ts` — `cardTokenSize` (local function)                                                  | stays domain feature                 | `domain/character/substrate/card-tokens.ts`                                                                                   | Local list-presentation logic; no consumer outside list (move only if the domain ever needs a general token-size utility elsewhere).                                                                                                                                                                                                                                                  | lint-time: `kit-purity` gate would catch it if it migrated to `kit` with domain deps                                           |
| `seed.ts` — `DefaultCharacterSeeder` with in-process memo + `inFlight Map`                          | stays domain feature                 | `domain/character/seeder/`                                                                                                    | Correct and well-sized; the two-layer idempotency + `ASSUMES(single-replica)` concurrency guard are intentional. Reorganized as a named subsystem for legibility.                                                                                                                                                                                                                     | —                                                                                                                              |
| `import/verbs/import-character.ts` + `export/verbs/export-character.ts` — direct `@orb/db` reads    | stays in import/export               | The serialization core (shared by import+export per `core/Spine-Config-and-Serialization.md` target) reads `@orb/db` directly | Expected pattern: import+export are bulk serializers, not CRUD callers. The serde core shares ONE mapper; it reads the schema tables directly (not through the character front door). Character's front door is for business-logic callers (tRPC, chat, buddy).                                                                                                                       | resolve-time: `@orb/db` is a declared dep of `@orb/server`                                                                     |
| `character_embeddings` table (currently in `db/schema/search.ts`)                                   | → `@orb/db`                          | `@orb/db/schema/embeddings.ts`                                                                                                | Schema-naming lie: the table is named for the consumer. In orbweaver the producer (character card text → `embeddings` domain's write path) drives schema ownership; the `embeddings` domain owns vector tables, so this lands in `embeddings.ts` only (db.md producer rule).                                                                                                          | compile-time: schema file location is the type source                                                                          |

---

## Cross-feature composition (the injection model)

Character is called by `chat`, `memory` (via roster for scoped-group digests), `import`, `export`,
`tag`, `workloads/discovery`. None of these import `domain/character` internals — all access is
through the front door or (for import/export) through `@orb/db` schema directly.

**Injected into `chat` at the composition root:**

| Op injected                             | Provided by      | Used for                                                                               |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `character.getCard`                     | character domain | ASSEMBLE RESOLVE phase — read live card fields per roster member (the card IS the row) |
| `character.mintSyntheticGroupCharacter` | character domain | room creation for scoped groups (replaces `_shared/group-character-rows.ts`)           |
| `character.findSyntheticGroupCharacter` | character domain | group-character lookup on send                                                         |

**Injected into `embeddings` via the content-changed event path:**

Character emits a `character.updated` event on save; the `embeddings` indexer subscribes and calls
`embeddings.store(kind='card', lens='card-text', key=characterId, content=..., model=embedModel)`.
Character does NOT call embeddings directly — zero reach into the knowledge cluster.

**`tag` junction:** `character_tags` is owned by `tag` domain (a junction over `characters.id`). The
`bulkAddCardTag` verb goes through the injected tag op (`tag.attachCardTagByName` — the by-name card path;
`attachTag` is the polymorphic targetType-dispatched verb), not a direct table write.

---

## Spine thread intersections

### §7.3 serialization / serde core

The full card type (`CreateCharacterSchema`) belongs in `@orb/contracts` as the ONE canonical card shape
(the `core/Spine-Config-and-Serialization.md` target: "model the FULL card as typed fields/columns"). **STATUS CORRECTED
2026-06-25 (verified against the steady clone): this promotion is already DONE, not pending.**
`creator`/`cardVersion`/`regexScripts`/`extensions` are typed columns (in neo, on `character_versions`
`db/schema/character.ts:137-140`; in orbweaver, on the flat `characters` row — D28) and the `raw` blob is
dropped — so an app-authored card already round-trips identically to an imported one. Orbweaver's job is to
**preserve** this, not re-derive it:
the canonical shape lives in `@orb/contracts/character`; the Zod schema validates both the wire (tRPC)
and the import normalizer (the tolerant `RawCard` adapter normalizes INTO it). Character's
`contract/params.ts` re-exports the inferred TS type from `@orb/contracts/character`. (import.md +
export.md both independently confirmed this against the code — the earlier "promote (pending)" framing
was stale recon.)

### §7.4 types and schemas — one home, one direction

- `createCharacterSchema` / `updateCharacterSchema` → `@orb/contracts/character` (cross-boundary wire).
- `CharacterDetail` / `CharacterSummary` → `domain/character/contract/views.ts` (domain-internal view;
  re-exported from the front door for client type-only use).
- `CardEdits` / `RemoveCharacterCleanup` → `domain/character/contract/params.ts` (domain-internal arg
  shapes). _(The neo `CvEdits`/`IdEdits`/`MintFirstVersionArgs` split is gone — one flat card, one edit shape.)_
- `CharacterContext` → explicit named interface, not `ReturnType<>`.
- `CharacterRow` (`typeof characters.$inferSelect`) → stays in `persistence/queries.ts` (a DB-row
  type derived from the schema; no leak).

### §7.5 string-union dispatch discipline

The `synthetic` flag is a boolean, not a union axis — no dispatch concern. The `role` on
`character_books` (`primary | auxiliary`) is a 2-member union; it must have ONE importable canonical
union in `@orb/contracts` (not re-declared in 3 mapper sites — the current serde-mapper triplication
is exactly the `messageRole` antipattern). `characters.ownerId` / `characterId` are TypeID-branded
(`CharacterId`; the neo `CharacterVersionId` brand is retired with the table, replaced by `SnapshotId`
for `character_snapshots` rows) — the brand discipline from neo-tavern carries forward.

### §8.6 first-class principal blast radius

The `synthetic=true` character is the precedent for an agent-owned identity row (the `__group__${chatId}`
namespace). When agents become first-class principals (their own `users` row — `AGENTS.md` §8.6),
the same provisioning pattern applies: `mintSyntheticGroupCharacter` ≈ `provisionAgentPrincipal`. Keep
the two concerns separate: character identity is the card; the principal (the seat at the chat table) is
a `chat_participants` row. A character agent has both.

---

## Invariants (gate candidates)

1. **There is no `character_versions` table** — the card is the flat `characters` row; any migration that
   re-introduces a version table (or `characters.currentVersionId` / a `version` counter / a
   `chats.characterVersionId` pin) is a compile-time error (none of those columns/tables exist).
   _Enforcement: compile-time (`tsc`) — table/column absence is a schema fact._

2. **Reading the card is reading the row** — `getCard` is owned by the character domain; callers inject it.
   No sibling domain re-implements a version lookup (there is none to implement).
   _Enforcement: lint-time (dep-cruiser `domain-no-cross-feature` rule — a domain may not reach
   into another domain's `persistence/` directly)._

3. **`synthetic=true` characters are filtered in every user-facing query** — `list` and every corpus
   consumer filters `WHERE synthetic = false`. A new query against `characters` that omits this filter
   silently exposes group buckets.
   _Enforcement: test-time — a character/list contract test asserts synthetic rows never appear in list results._

4. **Edit-in-place is the only card write path; history is append-only and gates nothing** — `update`
   writes the flat row in place; `snapshot` appends a `character_snapshots` blob; `restore` copies a blob
   back onto the live row in place. Nothing FKs `character_snapshots`, so a snapshot can never pin, block,
   or alter card resolution.
   _Enforcement: compile-time — no FK references `character_snapshots`; `CharacterService` is the
   exhaustive write surface; resolve-time — `character_snapshots` has no inbound FK in any schema file._

5. **Character associations key on `characters.id`, not a version** — `character_personas` and the
   re-keyed `character_books` both use the identity FK; the live card's book set is read at assemble.
   _Enforcement: compile-time — `@orb/db/schema/character`/`world-info` carry the identity FK; no
   cv-keyed FK exists._

6. **The character front door is the only call-site for business logic** — import/export bypass it by
   reading `@orb/db` directly (expected, sanctioned); all other callers (tRPC, chat, buddy, workloads)
   import `domain/character/index.ts` only.
   _Enforcement: lint-time (dep-cruiser `domain-no-cross-feature` rule)._

7. **`mintSyntheticGroupCharacter` is a character verb, not a `_shared` helper** — the `__group__${chatId}`
   handle namespace is owned here; no code outside `domain/character` inserts into `characters` directly.
   _Enforcement: lint-time (dep-cruiser — no direct `@orb/db/schema/character` writes outside
   `domain/character/persistence/`)._

---

## Resolved decisions (was: open)

- **`character_books` FK — RESOLVED: keys on `characters.id`.** `character_books.characterId` references
  `characters.id` (no cv exists); the live card's book set is read at assemble. A freeze-lore-at-a-snapshot
  feature, if ever wanted, would reference a `character_snapshots` id — never a cv.
  Locked consistently with `world-info.md`, `db.md`, `export.md`.
- **`restore` verb — RESOLVED: copy a snapshot blob onto the live row, in place.** `restore` reads a
  `character_snapshots.content` blob and writes it over the `characters` row (an `UPDATE`, not a new row).
  Snapshot-current-first so it's reversible. No partial restores (a partial restore is just an `update`).
- **`getCard` null semantics — RESOLVED (locked as contract invariant).** Returns `null` for "not owned"
  (and for a row mid-delete); callers treat `null` as "skip, not an error." Any rewrite that throws instead
  of returning `null` breaks the roster loop — this is a contract invariant, not an open question. (Gate: a
  contract test asserts null-not-throw for the not-owned and mid-delete cases.)
- **`raw` blob fate — RESOLVED: `raw` is dropped; residual unknown vendor keys live in `extensions`.** The
  steady clone already retired `raw` (verified `db/schema/character.ts:137-140`); there is no `raw` column
  in orbweaver. Genuinely-unknown vendor extras land in the typed `extensions` JSON column (the residual
  blob MINUS keys owned by typed columns). The gate that rejects promoting a KNOWN field into the residual
  blob is `core/Spine-Config-and-Serialization.md` invariant 2 (compile-time: the typed column is the only home).

### Still open (deferred, with criterion)

- **`snapshot` verb UX — DEFERRED (presentation only; does not block the verb).** _Criterion:_ decide at
  build time whether an explicit `snapshot` carries a user-visible label and surfaces in a version-history
  UI panel. The verb (mint a named restorable version) exists and is contract-stable regardless of the UX.
